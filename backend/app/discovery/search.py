"""Search results and ads (SerpAPI), Arabic + English UAE queries."""
import httpx

from ..config import SERPAPI_KEY
from ..pipeline.url_features import extract

QUERIES = ["ADCB login", "TAMM traffic fine payment", "UAE PASS login", "Abu Dhabi Police fines pay",
           "Salik recharge", "Emirates Post parcel delivery fee", "دفع مخالفات شرطة أبوظبي", "تسجيل دخول بنك أبوظبي التجاري"]


async def poll():
    if not SERPAPI_KEY:
        return []
    out = []
    async with httpx.AsyncClient(timeout=20) as c:
        for q in QUERIES:
            try:
                j = (await c.get("https://serpapi.com/search.json",
                                 params={"q": q, "gl": "ae", "hl": "en", "api_key": SERPAPI_KEY})).json()
            except Exception:
                continue
            for kind, items in (("ad", j.get("ads", [])), ("organic", j.get("organic_results", []))):
                for it in items:
                    link = it.get("link") or it.get("tracking_link")
                    if link and not extract(link)["allowlisted"]:
                        out.append({"source": f"search_{kind}", "kind": "url", "item": link, "brand": None,
                                    "meta": {"query": q, "title": it.get("title")}})
    return out
