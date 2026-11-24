"""Scan pipeline: features → intel → sandbox → content → visual → LLM → ML → score → evidence."""
import asyncio
import base64
import hashlib
import json
from urllib.parse import urlsplit

from .. import db
from ..config import DEMO_MODE, EVIDENCE_DIR
from . import content as content_mod
from . import llm, ml_model, network_intel, sandbox_client, scoring, url_features, visual


def _write_evidence(sid: str, steps: list, sb: dict, intel: dict):
    """Store evidence files with a SHA-256 manifest (chain of custody)."""
    ev = EVIDENCE_DIR / sid
    ev.mkdir(parents=True, exist_ok=True)
    manifest, shots = [], []

    def put(name, data: bytes):
        (ev / name).write_bytes(data)
        manifest.append({"file": name, "sha256": hashlib.sha256(data).hexdigest()})

    for i, s in enumerate(steps):
        put(f"screenshot_{i}.png", base64.b64decode(s["png_b64"]))
        shots.append({"index": i, "label": s["label"], "url": s["url"], "path": f"/api/scans/{sid}/screenshot/{i}"})
    if sb.get("html"):
        put("page.html", sb["html"].encode())
    put("network.json", json.dumps(sb.get("network", []), indent=1).encode())
    put("intel.json", json.dumps(intel, indent=1, default=str).encode())
    return ev, manifest, shots


def _brand(brand_id):
    b = url_features.BRAND_BY_ID.get(brand_id) if brand_id else None
    if not b:
        return {"id": brand_id} if brand_id else None
    return {"id": brand_id, "name": b["name"], "official_domain": b["official_domains"][0]}


async def run_scan(url: str, source="manual", agent=False, fast=False) -> dict:
    f = url_features.extract(url)
    if DEMO_MODE and (cached := db.latest_scan_for_domain(f["domain"])):
        return cached
    sid, started = db.new_id("scan"), db.now()

    # Official domains are safe unless a path/query could be an open redirect to somewhere else.
    bare = urlsplit(f["url"]).path in ("", "/") and not urlsplit(f["url"]).query
    if f["allowlisted"] and (fast or bare):
        intel, sb = {}, {}
    elif f["allowlisted"]:
        intel, sb = {}, await sandbox_client.visit(f["url"], agent=False)
        final = url_features.extract(sb["final_url"]) if sb.get("final_url") else f
        if final["domain"] != f["domain"]:
            final["redirected_from"] = f["url"]
            f = final
            intel = {} if f["allowlisted"] else await network_intel.gather(f["host"], f["domain"])
    elif fast:
        intel, sb = await network_intel.gather(f["host"], f["domain"]), {}
    else:
        intel, sb = await asyncio.gather(network_intel.gather(f["host"], f["domain"]),
                                         sandbox_client.visit(f["url"], agent=agent))
        # Re-run features on the final URL if we were redirected to another domain.
        if sb.get("final_url"):
            f2 = url_features.extract(sb["final_url"])
            if f2["domain"] != f["domain"]:
                f2["redirected_from"] = f["url"]
                # Keep shortener evidence from the original link.
                f2["shortener"] = f2["shortener"] or f["shortener"]
                f = f2
                intel = await network_intel.gather(f["host"], f["domain"])

    steps = sb.get("steps", [])
    c = content_mod.analyze(steps, bool(f["official_brand"]))
    v = await asyncio.to_thread(visual.compare, steps[0]["png_b64"]) if steps else None
    lm = await llm.analyze(f["url"], bool(f["official_brand"]), c) if steps and not f["allowlisted"] else None
    mp = ml_model.predict(f)
    sc, verdict, reasons = scoring.score(f, intel, sb, c, v, lm, mp)

    ev, manifest, shots = _write_evidence(sid, steps, sb, intel)
    if sc >= scoring.SUSPICIOUS_AT:
        brand_id = (f["brand_imitation"] or {}).get("brand") or (c["brands_mentioned"] or [None])[0] or (v or {}).get("best_brand")
    else:
        brand_id = f["official_brand"]
    result = {
        "id": sid, "url": url, "final_url": sb.get("final_url") or f["url"], "domain": f["domain"], "source": source,
        "score": sc, "verdict": verdict, "brand": _brand(brand_id),
        "reasons": reasons, "features": f, "intel": intel,
        "redirect_chain": sb.get("redirect_chain", []), "cloaking": sb.get("bot_view"),
        "content": {k: x for k, x in c.items() if k != "text_excerpt"},
        "visual": {k: x for k, x in (v or {}).items() if k != "all"}, "llm": lm, "ml_probability": mp,
        "screenshots": shots, "evidence_manifest": manifest, "sandbox_error": sb.get("error"),
        "created_at": started, "completed_at": db.now(),
    }
    (ev / "result.json").write_text(json.dumps(result, indent=1, default=str), encoding="utf-8")
    db.save_scan(result)
    return result
