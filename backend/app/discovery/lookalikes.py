"""Look-alike domains: dnstwist permutations plus UAE-specific variants, kept only if they resolve."""
import asyncio

import dns.asyncresolver
import dnstwist

from .. import watchlist
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


async def poll(include_dnstwist=True):
    out = await uae_variants()
    if include_dnstwist:
        for b in BRANDS:
            if not watchlist.polls(b):
                continue
            for od in b["official_domains"]:
                if od.endswith(".test"):
                    continue
                try:
                    rows = await asyncio.to_thread(_run, od)
                except Exception:
                    continue
                for r in rows:
                    if r.get("domain") != od and r.get("dns_a"):
                        out.append({"source": "lookalike", "kind": "domain", "item": r["domain"], "brand": b["id"],
                                    "meta": {"fuzzer": r.get("fuzzer")}})
    return out
