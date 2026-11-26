"""Fake Google Maps listings / helpline numbers (Google Places API, New).

One search+assess path serves two callers: the background discovery poll, and the on-demand
"Maps listing" scan in the dashboard (POST /api/scan/places).
"""
import asyncio
import json
import re

import httpx

from .. import db, watchlist
from ..config import GOOGLE_PLACES_KEY, MAPS_PER_CYCLE
from ..db import now
from ..pipeline.scoring import SCAM_AT, SUSPICIOUS_AT
from ..pipeline.url_features import BRANDS, extract, registered_domain

FIELDS = ("places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,"
          "places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri")
URL = "https://places.googleapis.com/v1/places:searchText"

# Why Maps discovery is or isn't producing anything — surfaced on /health and the watchlist panel,
# so a rejected key doesn't look identical to "no fake listings found".
last_status = {"state": "no_key" if not GOOGLE_PLACES_KEY else "idle", "detail": None, "at": None}

# Google overloads 403 for several different reasons: a genuinely disabled API or billing account
# (permanent — stop asking), and transient per-key throttling that clears within seconds (observed
# directly: the same key flipped 403 -> 200 -> 403 across a single session). The HTTP code alone
# can't tell these apart; the error body's `status`/`reason` fields can.
_PERMANENT_REASONS = {"SERVICE_DISABLED", "API_KEY_SERVICE_BLOCKED", "PERMISSION_DENIED",
                      "API_KEY_INVALID", "API_KEY_HTTP_REFERRER_BLOCKED", "API_KEY_IP_ADDRESS_BLOCKED"}
_RETRIES = 2


def _classify(status_code: int, body: dict) -> str:
    err = body.get("error") or {}
    reason = next((d.get("reason") for d in err.get("details", []) if d.get("reason")), None)
    if status_code == 401:
        return "invalid_key"
    if status_code == 429 or reason in ("RESOURCE_EXHAUSTED", "RATE_LIMIT_EXCEEDED"):
        return "quota"
    if status_code == 403:
        return "disabled" if (reason in _PERMANENT_REASONS or not reason) else "rate_limited"
    return "error"


def _set(state, detail=None):
    last_status.update(state=state, detail=detail, at=now())


def digits(s):
    return re.sub(r"\D", "", s or "")[-9:]


def listing_score(flags: list[str], claims_brand: bool) -> int:
    pts = {"website_not_official": 40, "phone_not_official": 40, "mobile_number_for_bank": 20}
    return min(100, sum(pts.get(f, 0) for f in flags) + (20 if claims_brand else 0))


FLAG_LABELS = {"website_not_official": "website is not the official one",
               "phone_not_official": "phone is not an official number",
               "mobile_number_for_bank": "helpline on a personal mobile number"}


def _official(b: dict | None) -> tuple[str, str]:
    """Official domain and phone to compare a listing against, as display strings."""
    doms = ", ".join(b["official_domains"]) if b and b["official_domains"] else "—"
    phones = ", ".join(b["phones"]) if b and b["phones"] else "—"
    return doms, phones


def listing_reasons(p: dict, b: dict | None) -> list[dict]:
    """Flags as bilingual reasons, each naming the offending value beside the official one.

    Same shape as pipeline.scoring reasons ({id, weight, reason_en, reason_ar}), so listings flow
    through the report template and the dashboard unchanged.
    """
    doms, phones = _official(b)
    site, phone = p.get("website") or "—", p.get("phone") or "—"
    brand = b["name"]["en"] if b else "—"
    out = []
    if "website_not_official" in p["flags"]:
        out.append({"id": "website_not_official", "weight": .40,
                    "reason_en": f"Listed website is not the official one: {site} (official: {doms})",
                    "reason_ar": f"الموقع المدرج ليس الموقع الرسمي: {site} (الرسمي: {doms})"})
    if "phone_not_official" in p["flags"]:
        out.append({"id": "phone_not_official", "weight": .40,
                    "reason_en": f"Listed phone is not an official number: {phone} (official: {phones})",
                    "reason_ar": f"الرقم المدرج ليس رقماً رسمياً: {phone} (الرسمي: {phones})"})
    if "mobile_number_for_bank" in p["flags"]:
        out.append({"id": "mobile_number_for_bank", "weight": .20,
                    "reason_en": f"Helpline uses a personal mobile number ({phone}), not a corporate line",
                    "reason_ar": f"خط المساعدة يستخدم رقم جوال شخصي ({phone}) بدلاً من خط مؤسسي"})
    if p.get("claims_brand"):
        out.append({"id": "claims_brand", "weight": .20,
                    "reason_en": f"The listing presents itself as {brand}",
                    "reason_ar": f"القائمة تقدّم نفسها على أنها {brand}"})
    return out


def verdict_for(score: int) -> str:
    return "scam" if score >= SCAM_AT else "suspicious" if score >= SUSPICIOUS_AT else "safe"


def listing_scan(p: dict, b: dict | None, query: str) -> dict:
    """A listing in scan shape, so it can be saved, reported and attached to a case like any scan."""
    site = p.get("website")
    host = registered_domain(extract(site)["host"]) if site else None
    doms, phones = _official(b)
    ts = now()
    return {
        # scan_ prefix is load-bearing: main.py guards the screenshot route on it.
        "id": db.new_id("scan"), "url": p.get("maps_url") or site or f"place:{p['id']}",
        "final_url": site, "domain": host or p["name"], "source": "maps",
        "score": p["score"], "verdict": verdict_for(p["score"]), "site_status": "listing",
        "brand": {"id": b["id"], "name": b["name"], "official_domain": (b["official_domains"] or [None])[0]} if b else None,
        "reasons": p.get("reasons") or listing_reasons(p, b),
        "listing": {"place_id": p["id"], "name": p["name"], "phone": p.get("phone"), "address": p.get("address"),
                    "website": site, "maps_url": p.get("maps_url"), "flags": p["flags"],
                    "signals": [FLAG_LABELS.get(f, f) for f in p["flags"]],
                    "claims_brand": p.get("claims_brand", False), "query": query,
                    "official_domains": doms, "official_phones": phones, "demo": p.get("demo", False)},
        "intel": {}, "screenshots": [], "evidence_manifest": [],
        "created_at": ts, "completed_at": ts,
    }


def assess(p: dict, b: dict | None) -> dict:
    """Score one Places result against a brand (None when the query matched no known brand)."""
    phone, site = p.get("internationalPhoneNumber"), p.get("websiteUri")
    name = (p.get("displayName") or {}).get("text", "")
    flags = []
    if site and not extract(site)["allowlisted"]:
        flags.append("website_not_official")
    official = {digits(x) for x in (b["phones"] if b else [])}
    if phone and official and digits(phone) not in official:
        flags.append("phone_not_official")
    if phone and re.search(r"(\+971|0)\s?5\d", phone) and official:
        flags.append("mobile_number_for_bank")
    # A listing only impersonates a brand if it puts the brand's name on itself. Without that,
    # an unofficial website just means a third party (a petrol station selling Salik top-ups), not a scam.
    claims = bool(b) and any(t.lower() in name.lower() for t in b["text_keywords"])
    out = {"id": p["id"], "name": name, "phone": phone, "website": site,
           "address": p.get("formattedAddress"), "maps_url": p.get("googleMapsUri"),
           "claims_brand": claims, "flags": flags,
           "score": listing_score(flags, claims) if flags and claims else 0}
    out["reasons"] = listing_reasons(out, b) if out["score"] else []
    return out


async def search(c: httpx.AsyncClient, query: str, b: dict | None) -> list[dict] | None:
    """One Places text search, each result assessed. None means the call failed (see last_status).

    Retries a 403/5xx a couple of times before giving up: a transient per-key throttle (observed
    recovering within minutes) looks identical to a real one on the first response.
    """
    last_exc = None
    for attempt in range(_RETRIES + 1):
        try:
            r = await c.post(URL, headers={"X-Goog-Api-Key": GOOGLE_PLACES_KEY, "X-Goog-FieldMask": FIELDS},
                             json={"textQuery": query, "regionCode": "AE", "languageCode": "en"})
        except Exception as e:
            last_exc = e
            await asyncio.sleep(1.5)
            continue
        if r.status_code == 200:
            _set("ok")
            return [assess(p, b) for p in r.json().get("places", [])]
        body = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
        state = _classify(r.status_code, body)
        err = body.get("error") or {}
        detail = f"{r.status_code} {err.get('status') or err.get('message') or r.reason_phrase}".strip()
        if state == "rate_limited" and attempt < _RETRIES:
            await asyncio.sleep(2 * (attempt + 1))
            continue
        _set(state, detail)
        return None
    _set("error", str(last_exc)[:120] if last_exc else "request failed")
    return None


# Fictional listings for the fictional Saqr Bank, so the Maps check can be demonstrated without
# waiting for a real impersonation to appear on Google Maps. Shaped exactly like a Places result and
# scored by assess() like any other — the numbers shown are produced by the real rules, not written here.
DEMO_PLACES = [
    {"id": "demo_1", "displayName": {"text": "Saqr Bank Customer Care"},
     "websiteUri": "http://saqrbank-secure-login.test", "internationalPhoneNumber": "+971 50 123 4567",
     "formattedAddress": "Hamdan Street, Abu Dhabi", "googleMapsUri": None},
    {"id": "demo_2", "displayName": {"text": "Saqr Bank Refund Office"},
     "websiteUri": "http://saqr-bank-verify.test", "internationalPhoneNumber": "+971 2 666 1234",
     "formattedAddress": "Al Najda Street, Abu Dhabi", "googleMapsUri": None},
    {"id": "demo_3", "displayName": {"text": "Saqr Bank Helpline 24/7"},
     "websiteUri": None, "internationalPhoneNumber": "+971 55 987 6543",
     "formattedAddress": "Electra Street, Abu Dhabi", "googleMapsUri": None},
    {"id": "demo_4", "displayName": {"text": "Saqr Bank - Khalidiya"},
     "websiteUri": "http://saqrbank.help", "internationalPhoneNumber": "0400 000 000",
     "formattedAddress": "Khalidiya, Abu Dhabi", "googleMapsUri": None},
    {"id": "demo_5", "displayName": {"text": "Saqr Bank - Abu Dhabi Main Branch"},
     "websiteUri": "http://saqrbank.test", "internationalPhoneNumber": "0400 000 000",
     "formattedAddress": "Corniche Road, Abu Dhabi", "googleMapsUri": None},
]


SWEEP_KEEP = 50  # newest sweeps kept in kv; older ones are dropped so the table can't grow unbounded


def save_sweep(r: dict) -> str:
    """Store a finished search so a listing can be reported later without re-querying Google."""
    sid = db.new_id("sweep")
    db.kv_set(f"sweep_{sid}", {**r, "id": sid, "created_at": now()})
    old = [row["k"] for row in db.C.execute(
        "SELECT k FROM kv WHERE k LIKE 'sweep_%' ORDER BY k DESC LIMIT -1 OFFSET ?", (SWEEP_KEEP,))]
    for k in old:
        db._exec("DELETE FROM kv WHERE k=?", (k,))
    return sid


def get_sweep(sid: str) -> dict | None:
    return db.kv_get(f"sweep_{sid}")


async def scan_query(query: str, b: dict | None) -> dict:
    """On-demand Maps check for the dashboard: every listing, flagged or not, worst first."""
    if b and b["id"] == "saqrbank":  # fictional brand -> fictional listings, never a Places call
        found = sorted((dict(assess(p, b), demo=True) for p in DEMO_PLACES), key=lambda x: -x["score"])
        return _sweep({"query": query, "status": "ok", "demo": True, "brand": b["id"],
                       "brand_name": b["name"]["en"], "official_domains": b["official_domains"],
                       "official_phones": _official(b)[1], "places": found})
    if not GOOGLE_PLACES_KEY:
        _set("no_key")
        return {"query": query, "status": "no_key", "places": []}
    async with httpx.AsyncClient(timeout=20) as c:
        found = await search(c, query, b)
    if found is None:
        return {"query": query, "status": last_status["state"], "detail": last_status["detail"], "places": []}
    found.sort(key=lambda x: -x["score"])
    return _sweep({"query": query, "status": "ok", "brand": b["id"] if b else None,
                   "brand_name": b["name"]["en"] if b else None,
                   "official_domains": b["official_domains"] if b else [],
                   "official_phones": _official(b)[1], "places": found})


def _sweep(r: dict) -> dict:
    return {**r, "sweep_id": save_sweep(r)}


async def poll():
    if not GOOGLE_PLACES_KEY:
        _set("no_key")
        return []
    out = []
    # Built-ins rotate here (unlike the other pollers, which exempt them); watchlist brands were
    # already gated by watchlist.polls(). Every brand every cycle was the actual cost driver.
    brands = [b for b in BRANDS if b["id"] != "saqrbank" and (b.get("wl") is None or watchlist.polls(b))]
    todo = db.slice_by_cursor(brands, "maps_cursor", MAPS_PER_CYCLE)
    async with httpx.AsyncClient(timeout=20) as c:
        for b in todo:
            for q in (f"{b['name']['en']} customer service", f"{b['name']['en']} branch Abu Dhabi"):
                found = await search(c, q, b)
                if found is None:
                    if last_status["state"] in ("invalid_key", "disabled", "quota", "rate_limited"):
                        return out  # already retried internally; more queries would just make it worse
                    continue
                for p in found:
                    if p["flags"] and p["claims_brand"]:
                        out.append({"source": "maps", "kind": "listing", "item": p["id"], "brand": b["id"],
                                    "meta": {"name": p["name"], "phone": p["phone"], "website": p["website"],
                                             "address": p["address"], "maps_url": p["maps_url"],
                                             "flags": p["flags"], "listing_score": p["score"]}})
    return out


def demo():
    """Self-check: python -m app.discovery.maps"""
    from ..pipeline.url_features import BRAND_BY_ID
    adcb = BRAND_BY_ID["adcb"]
    mk = lambda name, site, phone=None: {"id": "x", "displayName": {"text": name}, "websiteUri": site,
                                         "internationalPhoneNumber": phone}

    real = assess(mk("ADCB - Abu Dhabi Main Branch", "https://www.adcb.com/"), adcb)
    assert real["claims_brand"] and real["flags"] == [] and real["score"] == 0, real

    fake = assess(mk("ADCB Customer Care Helpline", "http://adcb-support-uae.com"), adcb)
    assert fake["claims_brand"] and "website_not_official" in fake["flags"], fake
    assert fake["score"] == 60, fake["score"]  # 40 unofficial site + 20 claims the brand

    # A third party with an unofficial site is not impersonating anyone: no score.
    third = assess(mk("ENOC Petrol Station", "https://enoc.com/"), BRAND_BY_ID["salik"])
    assert not third["claims_brand"] and third["score"] == 0, third

    # Unknown brand: nothing to compare against, so nothing is scored.
    unknown = assess(mk("Some Shop", "http://example.com"), None)
    assert unknown["score"] == 0 and not unknown["claims_brand"], unknown

    # The demo listings must span a believable range, and the genuine branch must score 0.
    saqr = BRAND_BY_ID["saqrbank"]
    scores = sorted((assess(p, saqr)["score"] for p in DEMO_PLACES), reverse=True)
    assert scores == [100, 100, 80, 60, 0], scores

    # Reasons are bilingual, one per fired signal, and name the official value to compare against.
    worst = assess(DEMO_PLACES[0], saqr)
    rs = listing_reasons(worst, saqr)
    assert len(rs) == len(worst["flags"]) + 1, rs          # every flag, plus claims_brand
    assert all(r["reason_en"] and r["reason_ar"] for r in rs), rs
    assert "saqrbank.test" in rs[0]["reason_en"] and "saqrbank.test" in rs[0]["reason_ar"], rs[0]

    # A listing in scan shape carries everything db.save_scan reads, and survives the result column.
    sc = listing_scan(worst, saqr, "Saqr Bank")
    for k in ("id", "url", "score", "verdict", "created_at"):
        assert sc[k] is not None, k
    assert sc["id"].startswith("scan_"), sc["id"]          # the screenshot route guards on this prefix
    assert sc["verdict"] == "scam" and sc["listing"]["name"] == worst["name"]
    assert json.loads(json.dumps(sc, default=str))["listing"]["place_id"] == worst["id"]

    # Verdict thresholds match pipeline.scoring, so a listing reads like any other scan.
    assert (verdict_for(100), verdict_for(60), verdict_for(0)) == ("scam", "suspicious", "safe")

    clean = assess(DEMO_PLACES[-1], saqr)
    assert listing_scan(clean, saqr, "q")["verdict"] == "safe"

    # A real 403 is overloaded by Google — only an explicit permanent reason (or none at all,
    # which is what a disabled API/billing returns) should stop retrying; anything else is transient.
    assert _classify(401, {}) == "invalid_key"
    assert _classify(429, {}) == "quota"
    assert _classify(403, {"error": {"details": [{"reason": "SERVICE_DISABLED"}]}}) == "disabled"
    assert _classify(403, {"error": {"details": [{"reason": "API_KEY_INVALID"}]}}) == "disabled"
    assert _classify(403, {}) == "disabled"                                    # no reason at all
    assert _classify(403, {"error": {"details": [{"reason": "SOMETHING_ELSE"}]}}) == "rate_limited"
    assert _classify(403, {"error": {"details": [{"reason": "RESOURCE_EXHAUSTED"}]}}) == "quota"
    assert _classify(500, {}) == "error"

    # Maps rotation: built-ins are capped per cycle like every other poller, not queried unconditionally.
    db._exec("DELETE FROM kv WHERE k=?", ("maps_cursor",))
    builtins = [b for b in BRANDS if b["id"] != "saqrbank" and not b.get("wl")]
    seen = set()
    for _ in range(-(-len(builtins) // max(1, MAPS_PER_CYCLE))):
        seen |= {b["id"] for b in db.slice_by_cursor(builtins, "maps_cursor", MAPS_PER_CYCLE)}
    assert seen == {b["id"] for b in builtins}, (len(seen), len(builtins))  # every brand reached, nothing skipped
    db._exec("DELETE FROM kv WHERE k=?", ("maps_cursor",))

    print("maps ok")


if __name__ == "__main__":
    demo()

