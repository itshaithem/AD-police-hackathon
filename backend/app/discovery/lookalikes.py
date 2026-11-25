"""Look-alike domains: dnstwist permutations plus UAE-specific variants, kept only if they resolve."""
import asyncio

import dns.asyncresolver
import dnstwist

from .. import db, watchlist
from ..config import DNSTWIST_PER_CYCLE
from ..pipeline.url_features import BRANDS

UAE_PATTERNS = ["{kw}-uae", "{kw}-pay", "{kw}-secure", "{kw}-fines", "{kw}ae", "my{kw}", "{kw}-ae", "{kw}-online",
                "{kw}-login", "{kw}-update", "{kw}-verify"]
UAE_TLDS = ["com", "net", "ae", "info", "online", "xyz", "top"]


def _run(domain):
    return dnstwist.run(domain=domain, registered=True, format="null", threads=48)


async def _resolves(name, resolver):
    try:
        await resolver.resolve(name, "A")
        return True
    except Exception:
        return False


async def uae_variants():
    r = dns.asyncresolver.Resolver()
    r.lifetime = 3
    cands = {}
    for b in BRANDS:
        if b["id"] == "saqrbank" or not watchlist.polls(b):
            continue
        for kw in b["keywords"]:
            for p in UAE_PATTERNS:
                for tld in UAE_TLDS:
                    cands[f"{p.format(kw=kw)}.{tld}"] = b["id"]
    names = list(cands)
    sem = asyncio.Semaphore(50)

    async def check(n):
        async with sem:
            return n if await _resolves(n, r) else None

    hits = [n for n in await asyncio.gather(*(check(n) for n in names)) if n]
    return [{"source": "lookalike", "kind": "domain", "item": n, "brand": cands[n], "meta": {"fuzzer": "uae-pattern"}}
            for n in hits]


def twist_slice(pairs: list, cursor: int, n: int) -> list:
    """A few official domains per cycle, wrapping — a full sweep is ~23s per domain."""
    if not pairs or n <= 0:
        return []
    cur = cursor % len(pairs)
    return (pairs + pairs)[cur:cur + min(n, len(pairs))]


async def poll(include_dnstwist=True):
    out = await uae_variants()
    if not include_dnstwist:
        return out
    pairs = [(b, od) for b in BRANDS for od in b["official_domains"] if not od.endswith(".test")]
    cur = db.kv_get("twist_cursor", 0)
    todo = twist_slice(pairs, cur, DNSTWIST_PER_CYCLE)
    db.kv_set("twist_cursor", (cur + DNSTWIST_PER_CYCLE) % max(1, len(pairs)))
    results = await asyncio.gather(*(asyncio.to_thread(_run, od) for _, od in todo), return_exceptions=True)
    for (b, od), rows in zip(todo, results):
        if isinstance(rows, Exception):
            continue
        for r in rows:
            if r.get("domain") != od and r.get("dns_a"):
                out.append({"source": "lookalike", "kind": "domain", "item": r["domain"], "brand": b["id"],
                            "meta": {"fuzzer": r.get("fuzzer")}})
    return out


def demo():
    """Self-check: python -m app.discovery.lookalikes"""
    pairs = [("b%d" % i, "d%d.com" % i) for i in range(5)]
    assert twist_slice(pairs, 0, 3) == pairs[:3]
    assert twist_slice(pairs, 3, 3) == pairs[3:] + pairs[:1]      # wraps
    assert twist_slice(pairs, 0, 9) == pairs                      # never repeats within one slice
    assert twist_slice([], 0, 3) == [] and twist_slice(pairs, 0, 0) == []
    seen = set()
    cur = 0
    for _ in range(2):                                            # two laps cover everything
        for p in twist_slice(pairs, cur, 3):
            seen.add(p)
        cur += 3
    assert seen == set(pairs), seen
    print("lookalikes ok")


if __name__ == "__main__":
    demo()
