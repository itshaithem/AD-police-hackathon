"""Fill Discovery, Network and Reports with real saved scans for the demo.

    python -m app.seed_demo            # demo sites + real look-alikes + live phishing sample
    python -m app.seed_demo --no-live  # demo sites only (offline-safe)

Everything is produced by the real pipeline: nothing is fabricated. Demo-site scans use the fictional
Saqr Bank pages (local only). The live sample comes from data/eval/labeled.csv (public phishing feed),
scanned in fast mode so nothing is submitted to live sites.
"""
import argparse
import asyncio
import csv
import random

from . import db, graph
from .config import DATA_DIR
from .discovery import lookalikes
from .pipeline import run_scan

DEMO_URLS = [
    ("http://saqrbank-secure-login.test/", True),
    ("http://saqr-bank-verify.test/", True),
    ("http://saqrbank.test/r/abc", False),
    ("http://saqrbank.test/", False),
]


async def _discover_and_scan(item: dict, fast: bool):
    did = db.insert_discovery(item)
    target = item["item"]
    try:
        r = await asyncio.wait_for(run_scan(target, source=item["source"], agent=item.get("agent", False), fast=fast), 90)
    except Exception as e:
        print(f"  ✗ {target}: {e}")
        return None
    if did:
        db.set_discovery_scan(did, r["id"])
    print(f"  {r['score']:3d} {r['verdict']:10} {r['domain']}")
    return r


async def main(live: bool):
    print("Demo sites (fictional Saqr Bank):")
    demo = []
    for url, agent in DEMO_URLS:
        r = await _discover_and_scan({"source": "lookalike", "kind": "url", "item": url, "brand": "saqrbank", "agent": agent}, fast=False)
        if r and r["score"] >= 40:
            demo.append(r)

    if live:
        print("Real look-alike domains of UAE brands (DNS-verified):")
        found = await lookalikes.uae_variants()
        sem = asyncio.Semaphore(5)

        async def one(d):
            async with sem:
                return await _discover_and_scan(d, fast=False)
        await asyncio.gather(*(one(d) for d in found[:25]))

        print("Live phishing sample (public feed, fast mode):")
        labeled = DATA_DIR / "eval" / "labeled.csv"
        if labeled.exists():
            with open(labeled, newline="", encoding="utf-8") as f:
                scams = [r["url"] for r in csv.DictReader(f) if r["label"] == "1"]
            random.seed(1)
            for u in random.sample(scams, min(20, len(scams))):
                await _discover_and_scan({"source": "search_organic", "kind": "url", "item": u, "brand": None}, fast=True)

    if demo and not db.list_cases():
        c = db.create_case("Saqr Bank credential phishing (demo)", [r["id"] for r in demo])
        print(f"Created case {c['id']} with {len(demo)} scans")
    g = graph.build()
    print(f"Graph: {len(g['clusters'])} cluster(s): " + ", ".join(f"{len(c['domains'])} domains" for c in g["clusters"]))


if __name__ == "__main__":
    ap = argparse.ArgumentParser(prog="python -m app.seed_demo")
    ap.add_argument("--no-live", action="store_true", help="only scan the local demo sites")
    asyncio.run(main(live=not ap.parse_args().no_live))
