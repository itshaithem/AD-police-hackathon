"""Look-alike domains: dnstwist permutations plus UAE-specific variants, kept only if they resolve."""
import asyncio

import dns.asyncresolver
import dnstwist

from .. import db, watchlist
from ..config import DNSTWIST_PER_CYCLE, UAE_PER_CYCLE
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
    # Every keyword expands to 77 candidates, and the same ones get re-probed each cycle for
    # almost no new hits. Rotate the keywords so one cycle stays cheap and a lap still covers all.
    pairs = [(b["id"], kw) for b in BRANDS if b["id"] != "saqrbank" and watchlist.polls(b) for kw in b["keywords"]]
    cands = {}
    for bid, kw in db.slice_by_cursor(pairs, "uae_cursor", UAE_PER_CYCLE):
        for p in UAE_PATTERNS:
            for tld in UAE_TLDS:
                cands[f"{p.format(kw=kw)}.{tld}"] = bid
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
    if not include_dnstwist:
        return out
    # A full sweep is ~23s per domain, so take a few per cycle and come back for the rest.
    pairs = [(b, od) for b in BRANDS for od in b["official_domains"] if not od.endswith(".test")]
    todo = db.slice_by_cursor(pairs, "twist_cursor", DNSTWIST_PER_CYCLE)
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
    """Self-check for the shared rotation: python -m app.discovery.lookalikes"""
    from .. import db
    items = ["a", "b", "c", "d", "e"]
    db.kv_set("t_demo", 0)
    assert db.slice_by_cursor(items, "t_demo", 3) == ["a", "b", "c"]
    assert db.slice_by_cursor(items, "t_demo", 3) == ["d", "e", "a"]      # wraps
    db.kv_set("t_demo", 0)
    assert db.slice_by_cursor(items, "t_demo", 9) == items                # never repeats in one slice
    assert db.slice_by_cursor([], "t_demo", 3) == []
    assert db.slice_by_cursor(items, "t_demo", 0) == []
    db.kv_set("t_demo", 0)
    seen = set()
    for _ in range(2):                                                    # two laps cover everything
        seen |= set(db.slice_by_cursor(items, "t_demo", 3))
    assert seen == set(items), seen
    db._exec("DELETE FROM kv WHERE k=?", ("t_demo",))
    print("lookalikes ok")


if __name__ == "__main__":
    demo()
