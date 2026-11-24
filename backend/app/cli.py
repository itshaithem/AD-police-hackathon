"""Batch scoring for a CSV of URLs (hidden test set).

    python -m app.cli score input.csv predictions.csv          # full pipeline (sandbox)
    python -m app.cli score input.csv predictions.csv --fast   # URL + network intel only

Output columns: url, verdict, score, is_scam (1/0), top_reasons. Never crashes: on error it falls back to the fast score,
and if that fails too it records an error row.
"""
import argparse
import asyncio
import csv
import sys
from typing import Callable

from .config import SCAN_CONCURRENCY
from .pipeline import run_scan

FIELDS = ["url", "verdict", "score", "is_scam", "top_reasons"]
PER_URL_TIMEOUT = 60


def read_urls(path) -> list[str]:
    with open(path, newline="", encoding="utf-8-sig") as f:
        rows = list(csv.DictReader(f))
    if not rows:
        return []
    key = next((k for k in rows[0] if k and k.strip().lower() == "url"), None)
    if key is None:
        raise SystemExit("input CSV needs a 'url' column")
    return [r[key].strip() for r in rows if (r.get(key) or "").strip()]


def _row(url, r):
    return {"url": url, "verdict": r["verdict"], "score": r["score"], "is_scam": int(r["verdict"] == "scam"),
            "top_reasons": " | ".join(x["reason_en"] for x in r["reasons"][:3])}


async def score_one(url: str, fast: bool) -> dict:
    try:
        return _row(url, await asyncio.wait_for(run_scan(url, source="batch", fast=fast), PER_URL_TIMEOUT))
    except Exception:
        if not fast:
            try:
                return _row(url, await asyncio.wait_for(run_scan(url, source="batch", fast=True), PER_URL_TIMEOUT))
            except Exception as e:
                return {"url": url, "verdict": "error", "score": "", "is_scam": "", "top_reasons": str(e)[:200]}
        return {"url": url, "verdict": "error", "score": "", "is_scam": "", "top_reasons": "scan failed"}


async def score_urls(urls: list[str], out_path, fast=False, progress: Callable[[int], None] | None = None):
    sem = asyncio.Semaphore(SCAN_CONCURRENCY)
    results: list[dict | None] = [None] * len(urls)
    done = 0

    async def work(i, u):
        nonlocal done
        async with sem:
            results[i] = await score_one(u, fast)
        done += 1
        if progress:
            progress(done)

    await asyncio.gather(*(work(i, u) for i, u in enumerate(urls)))
    with open(out_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=FIELDS)
        w.writeheader()
        w.writerows(results)
    return results


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.cli")
    sub = ap.add_subparsers(dest="cmd", required=True)
    s = sub.add_parser("score", help="score a CSV of URLs")
    s.add_argument("input")
    s.add_argument("output")
    s.add_argument("--fast", action="store_true", help="URL features + network intel only (no sandbox)")
    a = ap.parse_args(argv)
    urls = read_urls(a.input)
    print(f"scoring {len(urls)} URLs ({'fast' if a.fast else 'full'})…", file=sys.stderr)
    asyncio.run(score_urls(urls, a.output, a.fast, lambda n: print(f"\r{n}/{len(urls)}", end="", file=sys.stderr)))
    print(f"\nwrote {a.output}", file=sys.stderr)


if __name__ == "__main__":
    main()
