"""Fake Google Maps listings / helpline numbers (Google Places API, New)."""
import re

import httpx

from ..config import GOOGLE_PLACES_KEY
from ..pipeline.url_features import BRANDS, extract

FIELDS = ("places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,"
          "places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri")


def digits(s):
    return re.sub(r"\D", "", s or "")[-9:]


def listing_score(flags: list[str], claims_brand: bool) -> int:
    pts = {"website_not_official": 40, "phone_not_official": 40, "mobile_number_for_bank": 20}
    return min(100, sum(pts.get(f, 0) for f in flags) + (20 if claims_brand else 0))


async def poll():
    if not GOOGLE_PLACES_KEY:
        return []
    out = []
    async with httpx.AsyncClient(timeout=20) as c:
        for b in BRANDS:
            if b["id"] == "saqrbank":
                continue
            for q in (f"{b['name']['en']} customer service", f"{b['name']['en']} branch Abu Dhabi"):
                try:
                    r = await c.post("https://places.googleapis.com/v1/places:searchText",
                                     headers={"X-Goog-Api-Key": GOOGLE_PLACES_KEY, "X-Goog-FieldMask": FIELDS},
                                     json={"textQuery": q, "regionCode": "AE", "languageCode": "en"})
                    places = r.json().get("places", [])
                except Exception:
                    continue
                for p in places:
                    phone, site = p.get("internationalPhoneNumber"), p.get("websiteUri")
                    name = (p.get("displayName") or {}).get("text", "")
                    flags = []
                    if site and not extract(site)["allowlisted"]:
                        flags.append("website_not_official")
                    official = {digits(x) for x in b["phones"]}
                    if phone and official and digits(phone) not in official:
                        flags.append("phone_not_official")
                    if phone and re.search(r"(\+971|0)\s?5\d", phone) and official:
                        flags.append("mobile_number_for_bank")
                    if flags:
                        claims = any(t.lower() in name.lower() for t in b["text_keywords"])
                        out.append({"source": "maps", "kind": "listing", "item": p["id"], "brand": b["id"],
                                    "meta": {"name": name, "phone": phone, "website": site,
                                             "address": p.get("formattedAddress"), "maps_url": p.get("googleMapsUri"),
                                             "flags": flags, "listing_score": listing_score(flags, claims)}})
    return out
