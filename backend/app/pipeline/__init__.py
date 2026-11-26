"""Scan pipeline: features → intel → sandbox → content → visual → LLM → ML → score → evidence."""
import asyncio
import base64
import hashlib
import json
import re
from urllib.parse import urlsplit

from .. import db
from ..config import DEMO_MODE, EVIDENCE_DIR
from . import content as content_mod
from . import llm, ml_model, network_intel, sandbox_client, scoring, url_features, visual

EMAIL_URL_RE = re.compile(r"https?://[^\s<>\"')]+")


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
    # Watchlist brands may be keyword-only, with no official domain to compare against.
    return {"id": brand_id, "name": b["name"], "official_domain": (b["official_domains"] or [None])[0]}


def site_status(f: dict, intel: dict, sb: dict, fast: bool) -> str:
    """online | offline | not_registered (no DNS, no registration) | blocked (internal address) | unchecked."""
    if intel.get("internal") or "refusing to visit internal address" in str(sb.get("error") or ""):
        return "blocked"
    if f["allowlisted"] or f["host"].endswith(".test"):
        return "online" if sb.get("steps") or not sb else "offline"
    if sb.get("steps"):
        return "online"
    no_dns = not (intel.get("dns") or {}).get("a")
    unregistered = "404" in str((intel.get("whois") or {}).get("error", ""))
    if no_dns and unregistered:
        return "not_registered"
    if fast:
        return "offline" if no_dns else "unchecked"
    return "offline"


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
        if await network_intel.host_is_internal(f["host"]):
            intel, sb = {"internal": True}, {"error": "refusing to visit internal address"}
        else:
            intel, sb = await asyncio.gather(network_intel.gather(f["host"], f["domain"]),
                                             sandbox_client.visit(f["url"], agent=agent))
        # Re-run features on the final URL if we were redirected to another domain.
        if sb.get("final_url"):
            f2 = url_features.extract(sb["final_url"])
            if f2["domain"] in url_features.CFG.get("parking_hosts", []):
                f["parked"] = f2["domain"]  # keep judging the original domain
            elif f2["domain"] != f["domain"]:
                f2["redirected_from"] = f["url"]
                # Keep shortener evidence from the original link.
                f2["shortener"] = f2["shortener"] or f["shortener"]
                f = f2
                intel = await network_intel.gather(f["host"], f["domain"])

    steps = [] if f.get("parked") else sb.get("steps", [])
    c = content_mod.analyze(steps, bool(f["official_brand"]))
    v = await asyncio.to_thread(visual.compare, steps[0]["png_b64"]) if steps else None
    shots_b64 = [steps[0]["png_b64"]] + ([steps[-1]["png_b64"]] if len(steps) > 1 else []) if steps else []
    lm = await llm.analyze(f["url"], bool(f["official_brand"]), c, shots_b64) if steps and not f["allowlisted"] else None
    mp = None if f.get("parked") else ml_model.predict(f)
    sc, verdict, reasons = scoring.score(f, intel, sb, c, v, lm, mp)

    status = site_status(f, intel, sb, fast)
    url_only_score = None
    if status == "not_registered":
        # Nothing exists at this address: a risk score would describe the name, not a website.
        url_only_score = sc
        sc, verdict, reasons = 0, "not_found", scoring.not_registered_reasons(f)
    elif status == "blocked":
        sc, verdict, reasons = 0, "blocked", [scoring.BLOCKED_REASON]
    elif status == "offline":
        reasons = [scoring.OFFLINE_REASON] + reasons

    ev, manifest, shots = _write_evidence(sid, steps, sb, intel)
    if sc >= scoring.SUSPICIOUS_AT:
        brand_id = ((f["brand_imitation"] or {}).get("brand") or (c["brands_mentioned"] or [None])[0]
                    or url_features.brand_by_name((lm or {}).get("impersonated_brand")) or (v or {}).get("best_brand"))
    else:
        brand_id = f["official_brand"]
    result = {
        "id": sid, "url": url, "final_url": sb.get("final_url") or f["url"], "domain": f["domain"], "source": source,
        "score": sc, "verdict": verdict, "site_status": status, "url_only_score": url_only_score, "brand": _brand(brand_id),
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


async def run_email_scan(subject: str, sender: str, body: str) -> dict:
    """Content-only scan for pasted/extracted email text: no sandbox, no screenshots, not persisted.

    Reuses the same content heuristics + LLM analyst + scorer as a normal page scan, so email
    phishing text (urgency language, brand impersonation, requests for sensitive data) is judged
    by the same signals a scammy webpage would be. The first link in the body (if any) is checked
    for domain-level risk (new domain, typosquat, etc.) the same way a link scan would.
    """
    urls = EMAIL_URL_RE.findall(body)
    f = url_features.extract(urls[0]) if urls else {
        "allowlisted": False, "official_brand": None, "brand_imitation": None, "punycode": False,
        "is_ip": False, "suspicious_tld": False, "free_host": False, "shortener": False,
    }
    intel = await network_intel.gather(f["host"], f["domain"]) if urls and not f["allowlisted"] else {}
    c = content_mod.analyze([{"text": body, "title": subject, "forms": []}], bool(f.get("official_brand")))
    # The extension now calls this on every page it loads, so most calls are ordinary, harmless
    # pages. Skip the LLM (slow, paid) when the cheap heuristics found nothing at all — a page
    # with no urgency language, no brand mention, no form asks, and no risky link scores 0 either
    # way, so there's no signal for the LLM to weigh in on.
    has_signal = bool(c["urgency"] or c["asks_for"] or c["brands_mentioned"]
                      or f.get("brand_imitation") or f.get("punycode") or f.get("is_ip"))
    lm = await llm.analyze(urls[0] if urls else "(page, no link)", bool(f.get("official_brand")), c, []) if has_signal else None
    mp = ml_model.predict(f) if urls else None
    sc, verdict, reasons = scoring.score(f, intel, {}, c, None, lm, mp)
    return {
        "subject": subject, "sender": sender, "links_found": urls[:10],
        "score": sc, "verdict": verdict, "reasons": reasons,
        "content": {k: x for k, x in c.items() if k != "text_excerpt"}, "llm": lm,
    }
