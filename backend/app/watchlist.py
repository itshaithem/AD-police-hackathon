"""User watchlist: extra brands (keywords + official sites) layered on top of brands.yaml.

Every discovery poller and the brand-imitation scorer read one list, pipeline.url_features.BRANDS,
so turning watchlist entries into brand dicts and merging them there lights up certificate logs,
look-alike generation, search and Maps at once. Four modules hold that list *object*
(`from ..pipeline.url_features import BRANDS`), so every merge here mutates in place.
"""
import hashlib
import re

from . import db
from .config import WATCHLIST_SLICE
from .pipeline.url_features import BRAND_BY_ID, BRANDS, CFG, extract

MAX_ENTRIES = 200
MIN_KEYWORD = 3
SPLIT = re.compile(r"[\n,;]+")
_BASE_ALLOW = list(CFG["extra_allowlist"])  # snapshot, so repeated reloads don't accumulate entries
_BUILTIN = {re.sub(r"[^a-z0-9]+", "", k.lower()) for b in BRANDS for k in b["keywords"]}
ACTIVE: set[str] = set()  # watchlist brand ids polled this cycle (see rotate())


def _slug(kw: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "", kw.lower())
    return s or hashlib.sha1(kw.encode()).hexdigest()[:8]  # an Arabic-only keyword still needs a stable id


def _lines(v) -> list[str]:
    return [x.strip() for x in (SPLIT.split(v) if isinstance(v, str) else v or []) if x and x.strip()]


def norm_site(raw: str) -> str | None:
    """A pasted URL -> its registered domain, or None if it must not be allowlisted."""
    f = extract(raw)
    d = f["domain"]
    if f["is_ip"] or not d or "." not in d:
        return None
    if d in CFG["shorteners"] or any(d == h or d.endswith("." + h) for h in CFG["free_hosts"]):
        return None  # allowlisting bit.ly or a free host would blind the scanner for everyone
    return d


def validate(keywords, sites) -> tuple[list[str], list[str], list[dict]]:
    """-> (keywords, domains, rejected). Raises ValueError past the cap rather than truncating silently."""
    kws, rejected, seen = [], [], set()
    for k in _lines(keywords):
        if len(k) < MIN_KEYWORD:  # below this a keyword can't become a host keyword either (see _brand)
            rejected.append({"value": k, "reason": f"too short (minimum {MIN_KEYWORD} characters)"})
        elif k.lower() not in seen:
            seen.add(k.lower())
            kws.append(k)
    out = []
    for s in _lines(sites):
        d = norm_site(s)
        if not d:
            rejected.append({"value": s, "reason": "not a usable domain (IP address, shortener or free host)"})
        elif d not in out:
            out.append(d)
    if len(kws) > MAX_ENTRIES or len(out) > MAX_ENTRIES:
        raise ValueError(f"at most {MAX_ENTRIES} keywords and {MAX_ENTRIES} official sites")
    return kws, out, rejected


STRICT_BELOW = 5  # keywords shorter than this match whole labels only


def _brand(slug: str, name: str, host_kw: str | None, owned: list[str]) -> dict:
    # Short free-text keywords ("pay", "visa", "bank") match whole labels only, or they would fire as
    # a substring of half the internet. From 5 characters up, a substring hit is no coincidence, so
    # those match loosely and catch concatenations like adcbsecurelogin.com. Mirrors how
    # brands.yaml reserves strict for common words (apple, amazon, dhl, amex).
    return {"id": "wl_" + slug, "name": {"en": name, "ar": name}, "official_domains": owned,
            "keywords": [host_kw] if host_kw and len(host_kw) >= MIN_KEYWORD else [],
            "text_keywords": [name], "phones": [],
            "strict": not host_kw or len(host_kw) < STRICT_BELOW, "wl": True}


def build_brands(keywords: list[str], sites: list[str]) -> list[dict]:
    """Pair a keyword to an official site when the site's domain label contains it (adcb -> adcb.com)."""
    labels = [(d, d.split(".")[0]) for d in sites]
    out, seen, claimed = [], set(), set()
    for k in keywords:
        slug = _slug(k)
        if slug in _BUILTIN or slug in seen:
            continue  # a built-in brand already drives discovery for this keyword
        seen.add(slug)
        host_kw = slug if re.search(r"[a-z0-9]", k.lower()) else None  # Arabic cannot appear in a hostname
        owned = [d for d, lab in labels if host_kw and host_kw in lab]
        claimed.update(owned)
        out.append(_brand(slug, k, host_kw, owned))
    for d, lab in labels:  # a site nobody paired to is still worth monitoring on its own name
        if d not in claimed and _slug(lab) not in _BUILTIN and _slug(lab) not in seen:
            seen.add(_slug(lab))
            out.append(_brand(_slug(lab), lab, _slug(lab), [d]))
    return out


def _merge(brands: list[dict], allow: list[str]):
    """Replace the watchlist layer IN PLACE — four modules hold the BRANDS list object itself."""
    BRANDS[:] = [b for b in BRANDS if not b.get("wl")] + brands
    BRAND_BY_ID.clear()
    BRAND_BY_ID.update({b["id"]: b for b in BRANDS})
    CFG["extra_allowlist"][:] = _BASE_ALLOW + [d for d in allow if d not in _BASE_ALLOW]


def load() -> dict:
    return db.kv_get("watchlist", {"keywords": [], "sites": [], "saved_at": None})


def reload():
    """Apply the stored watchlist to the brand registry. Idempotent."""
    wl = load()
    _merge(build_brands(wl["keywords"], wl["sites"]), wl["sites"])


def save(keywords: list[str], sites: list[str]) -> dict:
    # Newly added keywords lead the list and the cursor resets, so the save-triggered run works on them first.
    old = set(load()["keywords"])
    wl = {"keywords": [k for k in keywords if k not in old] + [k for k in keywords if k in old],
          "sites": sites, "saved_at": db.now()}
    db.kv_set("watchlist", wl)
    db.kv_set("wl_cursor", 0)
    reload()
    return wl


def polls(b: dict) -> bool:
    """Pollers ask this per brand: built-ins always run; watchlist brands only in this cycle's slice."""
    return not b.get("wl") or b["id"] in ACTIVE


def rotate() -> list[str]:
    """Advance the cursor and publish this cycle's watchlist ids. Called once per discovery run."""
    ids = [b["id"] for b in BRANDS if b.get("wl")]
    cur = db.kv_get("wl_cursor", 0)
    n = max(1, WATCHLIST_SLICE)
    if cur >= len(ids):
        cur = 0
    ACTIVE.clear()
    ACTIVE.update(ids[cur:cur + n])
    db.kv_set("wl_cursor", 0 if cur + n >= len(ids) else cur + n)
    return sorted(ACTIVE)


def demo():
    """Self-check: python -m app.watchlist"""
    from .pipeline.url_features import is_allowlisted
    kws, sites, bad = validate("adcb\nSaqr Trust, بنك صقر; sq", ["https://www.saqrtrust.ae/en/login", "8.8.8.8", "bit.ly/x"])
    assert sites == ["saqrtrust.ae"], sites
    assert len(bad) == 3, bad                                       # "sq" too short + IP + shortener
    assert sum("too short" in b["reason"] for b in bad) == 1, bad

    bs = build_brands(kws, sites)
    ids = [b["id"] for b in bs]
    assert "wl_adcb" not in ids, ids                                # built-in keyword is not duplicated
    saqr = next(b for b in bs if b["id"] == "wl_saqrtrust")
    assert saqr["official_domains"] == ["saqrtrust.ae"] and saqr["keywords"] == ["saqrtrust"], saqr
    ar = next(b for b in bs if b["text_keywords"] == ["بنك صقر"])
    assert ar["keywords"] == [] and ar["official_domains"] == []    # Arabic drives page-text matching only

    base, obj = len(BRANDS), BRANDS
    _merge(bs, sites)
    _merge(bs, sites)                                               # idempotent, and the same list object
    assert BRANDS is obj and len(BRANDS) == base + len(bs), len(BRANDS)
    assert BRAND_BY_ID["wl_saqrtrust"] is saqr
    assert is_allowlisted("login.saqrtrust.ae")                     # an official site can never score as a scam

    try:
        validate(["kw%d" % i for i in range(MAX_ENTRIES + 1)], [])
        raise AssertionError("cap not enforced")
    except ValueError:
        pass

    # Long keywords match loosely (catching concatenations); short ones stay whole-label only.
    long_b, short_b = build_brands(["mohre"], [])[0], build_brands(["adp"], [])[0]
    assert long_b["strict"] is False and short_b["strict"] is True, (long_b["strict"], short_b["strict"])
    _merge([long_b, short_b], [])
    from .pipeline.url_features import brand_match
    assert brand_match("mohrefines.com")[0]["id"] == "wl_mohre"            # concatenated, no separator
    assert brand_match("m0hre.ae")[1] == "homoglyph"                       # zero for o
    assert brand_match("rnohre.ae")[1] == "homoglyph"                      # rn read as m
    assert brand_match("myadpshop.com")[0] is None                         # short keyword stays contained
    _merge([], [])

    # Rotation covers every entry exactly once per lap, with no gaps, and wraps.
    many = build_brands([f"brand{i}" for i in range(12)], [])
    _merge(many, [])
    keep = globals()["WATCHLIST_SLICE"]
    globals()["WATCHLIST_SLICE"] = 5
    try:
        db.kv_set("wl_cursor", 0)
        laps, seen = [], set()
        for _ in range(3):                                          # 12 brands / slice 5 -> 5, 5, 2
            got = rotate()
            laps.append(len(got))
            seen |= set(got)
        assert laps == [5, 5, 2], laps
        assert seen == {b["id"] for b in many}, len(seen)
        assert rotate() == sorted(b["id"] for b in many[:5])        # wrapped back to the start
    finally:
        globals()["WATCHLIST_SLICE"] = keep
        db.kv_set("wl_cursor", 0)

    _merge([], [])
    assert len(BRANDS) == base and CFG["extra_allowlist"] == _BASE_ALLOW
    print("watchlist ok")


if __name__ == "__main__":
    demo()
