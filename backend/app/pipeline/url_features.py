import ipaddress
import math
import re
from pathlib import Path
from urllib.parse import urlsplit

import tldextract
import yaml
from rapidfuzz.distance import Levenshtein

CFG = yaml.safe_load((Path(__file__).parent.parent / "brands.yaml").read_text(encoding="utf-8"))
BRANDS = CFG["brands"]
BRAND_BY_ID = {b["id"]: b for b in BRANDS}
EXTRACT = tldextract.TLDExtract(suffix_list_urls=(), extra_suffixes=["test"], include_psl_private_domains=True)  # offline snapshot
CONFUSABLE = str.maketrans({"а": "a", "е": "e", "о": "o", "р": "p", "с": "c", "х": "x", "і": "i", "ӏ": "l", "ј": "j",
                            "0": "o", "1": "l", "3": "e", "5": "s", "$": "s", "@": "a"})
URL_KEYWORDS = ("login", "verify", "secure", "update", "account", "pay", "fine", "refund", "otp", "wallet")


def normalize_url(u: str) -> str:
    u = u.strip()
    return u if re.match(r"^[a-z][a-z0-9+.-]*://", u, re.I) else "http://" + u


def registered_domain(host: str) -> str:
    e = EXTRACT(host)
    return getattr(e, "top_domain_under_public_suffix", None) or e.registered_domain


def official_brand(domain: str):
    d = domain.lower()
    for b in BRANDS:
        for od in b["official_domains"]:
            if d == od or d.endswith("." + od):
                return b
    return None


def is_allowlisted(domain: str) -> bool:
    d = domain.lower()
    if official_brand(d):
        return True
    if any(d == a or d.endswith("." + a) for a in CFG["extra_allowlist"]):
        return True
    return any(d.endswith(s) for s in CFG["allowlist_suffixes"])


def entropy(s):
    if not s:
        return 0.0
    p = [s.count(c) / len(s) for c in set(s)]
    return -sum(x * math.log2(x) for x in p)


def skeleton(s: str) -> str:
    try:
        s = s.encode().decode("idna") if "xn--" in s else s
    except Exception:
        pass
    return s.lower().translate(CONFUSABLE).replace("rn", "m").replace("vv", "w")


def brand_match(host: str):
    """Return (brand, kind, detail) if the host imitates a brand."""
    sk = skeleton(host)
    labels = re.split(r"[.\-_]", sk)
    raw = host.lower()
    tokens = set(labels)
    for b in BRANDS:
        strict = b.get("strict", False)
        for kw in b["keywords"]:
            k = kw.replace("-", "")
            if strict:
                # Common words (apple, amazon…) only count as a whole label/word, never a substring.
                if k in tokens:
                    return b, ("keyword" if k in re.split(r"[.\-_]", raw) else "homoglyph"), kw
            elif kw in raw or k in sk.replace("-", ""):
                return b, ("keyword" if kw in raw else "homoglyph"), kw
            # Typosquats (one edit) only for keywords long enough that one edit is unlikely to be a real word.
            if len(k) >= 6:
                for lab in labels:
                    if len(lab) >= 5 and Levenshtein.distance(lab, k) == 1:
                        return b, "typosquat", f"{lab}≈{k}"
    return None, None, None


def extract(url: str) -> dict:
    url = normalize_url(url)
    p = urlsplit(url)
    host = (p.hostname or "").lower()
    rd = registered_domain(host) or host
    ext = EXTRACT(host)
    try:
        ipaddress.ip_address(host)
        is_ip = True
    except ValueError:
        is_ip = False
    allow = is_allowlisted(rd)
    brand, kind, detail = brand_match(host)
    return {
        "url": url, "host": host, "domain": rd, "tld": ext.suffix, "scheme": p.scheme,
        "is_ip": is_ip, "punycode": "xn--" in host,
        "subdomain_depth": len([x for x in ext.subdomain.split(".") if x]),
        "url_len": len(url), "host_len": len(host), "digits": sum(c.isdigit() for c in host),
        "hyphens": host.count("-"), "entropy": round(entropy(host), 3), "has_at": "@" in url,
        "path_len": len(p.path), "query_len": len(p.query),
        "suspicious_tld": ext.suffix.split(".")[-1] in CFG["suspicious_tlds"],
        "free_host": any(host == f or host.endswith("." + f) for f in CFG["free_hosts"]),
        "shortener": rd in CFG["shorteners"],
        "allowlisted": allow, "official_brand": (official_brand(rd) or {}).get("id"),
        "brand_imitation": {"brand": brand["id"], "kind": kind, "detail": detail} if brand and not allow else None,
        "keywords": [w for w in URL_KEYWORDS if w in url.lower()],
    }
