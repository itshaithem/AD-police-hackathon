"""Page content analysis: requested data, urgency language, brand mentions, phone numbers."""
import re

from .url_features import BRANDS, CFG

PHONE_RE = re.compile(r"(?:\+?971|00971|0)\s?(?:5\d|[2-9])[\s-]?\d{3}[\s-]?\d{4}")
FORM_KEYS = ("type", "name", "id", "placeholder", "autocomplete", "label")


def analyze(steps: list, domain_is_official: bool) -> dict:
    forms = [f for s in steps for f in s.get("forms", [])]
    text = " ".join(s.get("text", "") for s in steps)
    title = " ".join(s.get("title", "") for s in steps)

    def has(*keys):
        return any(any(k in " ".join(str(f.get(x, "")) for x in FORM_KEYS).lower() for k in keys) for f in forms)

    asks = {
        "password": any(f.get("type") == "password" for f in forms),
        "card": has("cc-number", "card", "بطاقة", "pan"),
        "cvv": has("cvv", "cvc", "csc"),
        "otp": has("otp", "one-time", "رمز التحقق", "verification code"),
        "emirates_id": has("emirates id", "eid", "784", "الهوية"),
    }
    low = text.lower()
    urgency = [k for k in CFG["urgency_keywords"]["en"] if k in low] + [k for k in CFG["urgency_keywords"]["ar"] if k in text]
    hay = (text + " " + title).lower()
    mentioned = [] if domain_is_official else [b["id"] for b in BRANDS if any(t.lower() in hay for t in b["text_keywords"])]
    arabic_ratio = len(re.findall(r"[؀-ۿ]", text)) / max(1, len(text))
    sig = "|".join(sorted(f"{f.get('type')}:{f.get('name')}" for f in forms))
    return {"asks_for": [k for k, v in asks.items() if v], "urgency": urgency[:8],
            "brands_mentioned": mentioned, "phones": sorted(set(PHONE_RE.findall(text)))[:10],
            "language": "ar" if arabic_ratio > 0.3 else ("mixed" if arabic_ratio > 0.05 else "en"),
            "form_signature": sig, "title": title[:200], "text_excerpt": text[:3000]}
