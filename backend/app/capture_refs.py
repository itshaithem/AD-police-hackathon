"""Capture reference screenshots of official brand pages for visual similarity.

    python -m app.capture_refs                 # all brands
    python -m app.capture_refs saqrbank adcb   # only these

Uses the sandbox (same mobile viewport as scans) and saves data/references/<brand_id>.png.
A brand can set `ref_url` in brands.yaml (e.g. its login page); otherwise its first official domain is used.
"""
import asyncio
import base64
import sys

from .config import DATA_DIR
from .pipeline import sandbox_client
from .pipeline.url_features import BRANDS


def ref_url(b) -> str:
    if b.get("ref_url"):
        return b["ref_url"]
    d = b["official_domains"][0]
    return f"http://{d}/" if d.endswith(".test") else f"https://{d}/"


async def capture(ids: list[str]):
    out = DATA_DIR / "references"
    out.mkdir(parents=True, exist_ok=True)
    for b in BRANDS:
        if ids and b["id"] not in ids:
            continue
        url = ref_url(b)
        r = await sandbox_client.visit(url)
        if not r.get("steps"):
            print(f"✗ {b['id']:16} {url}  {r.get('error') or 'no screenshot'}")
            continue
        (out / f"{b['id']}.png").write_bytes(base64.b64decode(r["steps"][0]["png_b64"]))
        print(f"✓ {b['id']:16} {url}")


if __name__ == "__main__":
    asyncio.run(capture(sys.argv[1:]))
