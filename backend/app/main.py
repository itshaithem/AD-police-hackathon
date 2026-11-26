"""ScamShield AI API."""
import asyncio
import contextlib
import datetime as dt
import hashlib
import json
import logging

from fastapi import BackgroundTasks, Depends, FastAPI, File, HTTPException, Query, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, PlainTextResponse, Response

from . import db, evidence, graph, watchlist
from .cli import read_urls, score_urls
from .config import API_KEY, CORS_ORIGINS, DATA_DIR, DISCOVERY_ENABLED, EVIDENCE_DIR, LLM_PROVIDER, WATCHLIST_SLICE
from .discovery import loop as discovery, maps
from .pipeline import llm, run_email_scan, run_scan, sandbox_client, scoring, visual
from .pipeline.url_features import BRAND_BY_ID, BRANDS, brand_by_name
from .schemas import (CaseCreate, CasePatch, DiscoveryToggle, EmailScanRequest, PlacesScanRequest, ScanRequest,
                      WatchlistSave)

logging.basicConfig(level=logging.INFO)


async def warm_up():
    """Load CLIP and the local model into memory at startup, so the first demo scan isn't the slow one."""
    await asyncio.to_thread(visual.available)
    await llm.warm_up()


@contextlib.asynccontextmanager
async def lifespan(app: FastAPI):
    watchlist.reload()  # apply the saved watchlist before discovery starts polling
    task = asyncio.create_task(discovery.forever()) if DISCOVERY_ENABLED else None
    warm = asyncio.create_task(warm_up())
    yield
    warm.cancel()
    if task:
        task.cancel()


app = FastAPI(title="ScamShield AI", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["*"], allow_headers=["*"])


def auth(request: Request):
    """X-API-Key header, or ?key= for <img> tags and downloads."""
    if (request.headers.get("x-api-key") or request.query_params.get("key")) != API_KEY:
        raise HTTPException(401, "invalid API key")


def _scan_or_404(sid):
    s = db.get_scan(sid)
    if not s:
        raise HTTPException(404, "scan not found")
    return s


def _case_or_404(cid):
    c = db.get_case(cid)
    if not c:
        raise HTTPException(404, "case not found")
    return c


def summary(s: dict) -> dict:
    return {k: s.get(k) for k in ("id", "url", "final_url", "domain", "score", "verdict", "brand", "source", "created_at")}


# ---------------- health ----------------
@app.get("/health")
async def health():
    sb, lm = await asyncio.gather(sandbox_client.healthy(), llm.healthy())
    return {"backend": "ok", "db": "ok", "sandbox": "ok" if sb else "down", "llm": "ok" if lm else "down", "llm_provider": LLM_PROVIDER if lm else None,
            "visual": "ok" if visual._model is not None else ("down" if visual._failed or not visual.VISUAL_ENABLED else "idle"),
            "discovery": ("ok" if discovery.is_enabled() else "paused") if DISCOVERY_ENABLED else "down",
            "places": maps.last_status["state"],
            "last_discovery": discovery.last_run or None}


# ---------------- scans ----------------
@app.post("/api/scan", dependencies=[Depends(auth)])
async def scan(req: ScanRequest):
    return await run_scan(req.url, agent=req.agent, fast=req.fast)


@app.post("/api/scan/email", dependencies=[Depends(auth)])
async def scan_email(req: EmailScanRequest):
    """Content-only scan for email text (pasted, or extracted from an open webmail message)."""
    return await run_email_scan(req.subject, req.sender, req.body)


@app.post("/api/scan/places", dependencies=[Depends(auth)])
async def scan_places(req: PlacesScanRequest):
    """On-demand Google Maps check: every listing for a query, scored against the brand it claims."""
    b = BRAND_BY_ID.get(brand_by_name(req.query) or "")
    return await maps.scan_query(req.query.strip(), b)


def _sweep_or_404(sweep_id: str) -> dict:
    sw = maps.get_sweep(sweep_id)
    if not sw:
        raise HTTPException(404, "search expired — run the Maps check again")
    return sw


def _place_or_404(sw: dict, place_id: str) -> dict:
    p = next((x for x in sw["places"] if x["id"] == place_id), None)
    if not p:
        raise HTTPException(404, "listing not in this search")
    return p


@app.post("/api/scan/places/{sweep_id}/{place_id}/save", dependencies=[Depends(auth)])
async def save_place(sweep_id: str, place_id: str):
    """Persist a listing as a scan, so the existing report/case routes all apply to it."""
    sw = _sweep_or_404(sweep_id)
    saved = sw.setdefault("saved", {})
    if place_id in saved and db.get_scan(saved[place_id]["scan_id"]):
        return saved[place_id]  # idempotent: one listing, one scan row

    p = _place_or_404(sw, place_id)
    b = BRAND_BY_ID.get(sw.get("brand") or "")
    scan = maps.listing_scan(p, b, sw["query"])

    # Evidence pack: the listing itself, hashed, same chain-of-custody shape as a website scan.
    ev = EVIDENCE_DIR / scan["id"]
    ev.mkdir(parents=True, exist_ok=True)
    blob = json.dumps(scan["listing"], indent=1, ensure_ascii=False).encode()
    (ev / "listing.json").write_bytes(blob)
    scan["evidence_manifest"] = [{"file": "listing.json", "sha256": hashlib.sha256(blob).hexdigest()}]

    # A listing's website is a real site: scan it properly so the case carries a screenshot too.
    website_scan_id = None
    if p.get("website"):
        try:
            r = await asyncio.wait_for(run_scan(p["website"], source="maps"), timeout=120)
            website_scan_id = r["id"]
            scan["listing"]["website_scan_id"] = website_scan_id
        except Exception as e:
            logging.warning("website scan for listing %s failed: %s", place_id, e)

    db.save_scan(scan)
    (ev / "result.json").write_text(json.dumps(scan, indent=1, default=str), encoding="utf-8")
    out = {"scan_id": scan["id"], "website_scan_id": website_scan_id}
    saved[place_id] = out
    db.kv_set(f"sweep_{sweep_id}", sw)
    return out


@app.get("/api/scan/places/{sweep_id}/report.pdf", dependencies=[Depends(auth)])
async def sweep_pdf(sweep_id: str):
    """One report for the whole search: what was checked, and every impersonating listing."""
    sw = _sweep_or_404(sweep_id)
    b = BRAND_BY_ID.get(sw.get("brand") or "")
    flagged = [p for p in sw["places"] if p["score"] > 0]
    scans = [maps.listing_scan(p, b, sw["query"]) for p in flagged]
    head = {**sw, "checked": len(sw["places"]), "flagged": len(flagged)}
    return Response(await evidence.build_sweep_pdf(head, scans), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="maps_{sweep_id}.pdf"'})


@app.post("/api/scan/batch", dependencies=[Depends(auth)])
async def scan_batch(bg: BackgroundTasks, file: UploadFile = File(...), fast: bool = Query(False)):
    jobs_dir = DATA_DIR / "jobs"
    jobs_dir.mkdir(exist_ok=True)
    tmp = jobs_dir / f"upload_{db.new_id('u')}.csv"
    tmp.write_bytes(await file.read())
    try:
        urls = read_urls(tmp)
    except SystemExit as e:
        raise HTTPException(400, str(e))
    jid = db.create_job(len(urls), "")
    out = jobs_dir / f"{jid}.csv"
    db.update_job(jid, out_path=str(out))

    async def work():
        try:
            await score_urls(urls, out, fast, lambda n: db.update_job(jid, done=n))
            db.update_job(jid, status="done")
        except Exception:
            db.update_job(jid, status="error")

    bg.add_task(work)
    return {"job_id": jid, "total": len(urls)}


@app.get("/api/jobs/{jid}", dependencies=[Depends(auth)])
def job(jid: str):
    j = db.get_job(jid)
    if not j:
        raise HTTPException(404, "job not found")
    return {k: j[k] for k in ("id", "status", "total", "done", "created_at")}


@app.get("/api/jobs/{jid}/csv", dependencies=[Depends(auth)])
def job_csv(jid: str):
    j = db.get_job(jid)
    if not j or j["status"] != "done":
        raise HTTPException(404, "results not ready")
    return FileResponse(j["out_path"], media_type="text/csv", filename=f"{jid}_predictions.csv")


@app.get("/api/scans", dependencies=[Depends(auth)])
def scans(limit: int = 100, min_score: int = 0):
    return [summary(s) for s in db.list_scans(limit, min_score)]


@app.get("/api/scans/{sid}", dependencies=[Depends(auth)])
def scan_by_id(sid: str):
    return _scan_or_404(sid)


@app.get("/api/scans/{sid}/screenshot/{n}", dependencies=[Depends(auth)])
def screenshot(sid: str, n: int):
    p = EVIDENCE_DIR / sid / f"screenshot_{n}.png"
    if not sid.startswith("scan_") or not p.exists():
        raise HTTPException(404, "screenshot not found")
    return FileResponse(p, media_type="image/png")


@app.get("/api/scans/{sid}/report.pdf", dependencies=[Depends(auth)])
async def scan_pdf(sid: str):
    s = _scan_or_404(sid)
    return Response(await evidence.build_scan_pdf(s), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{sid}.pdf"'})


@app.get("/api/scans/{sid}/report.json", dependencies=[Depends(auth)])
def scan_json(sid: str):
    s = _scan_or_404(sid)
    return Response(json.dumps(s, indent=1, ensure_ascii=False, default=str), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{sid}.json"'})


@app.get("/api/scans/{sid}/takedown.txt", dependencies=[Depends(auth)])
def scan_takedown(sid: str):
    return PlainTextResponse(evidence.takedown_draft(_scan_or_404(sid)))


@app.get("/api/references/{brand_id}.png", dependencies=[Depends(auth)])
def reference(brand_id: str):
    if brand_id not in BRAND_BY_ID:
        raise HTTPException(404, "unknown brand")
    p = DATA_DIR / "references" / f"{brand_id}.png"
    if not p.exists():
        raise HTTPException(404, "no reference screenshot")
    return FileResponse(p, media_type="image/png")


# ---------------- discovery ----------------
# A score filter has to look past the newest page: bulk look-alike candidates arrive in the
# thousands, so the scored findings are rarely among the most recent rows. Same window /api/stats
# counts over, so the tile and the filtered feed always agree.
DISCOVERY_SCAN_WINDOW = 5000


def _discovery_item(d: dict) -> dict:
    s = db.get_scan(d["scan_id"]) if d.get("scan_id") else None
    score = s["score"] if s else d["meta"].get("listing_score")
    verdict = s["verdict"] if s else (None if score is None else scoring.verdict_for(score))
    brand = d.get("brand") or ((s or {}).get("brand") or {}).get("id")
    return {**d, "brand": brand, "score": score, "verdict": verdict}


@app.get("/api/discovery", dependencies=[Depends(auth)])
def discovery_list(source: str | None = None, min_score: int = 0, limit: int = 200):
    items = [_discovery_item(d) for d in db.list_discoveries(source, DISCOVERY_SCAN_WINDOW if min_score else limit)]
    if min_score:
        items = [i for i in items if (i["score"] or 0) >= min_score]
    return items[:limit]


@app.post("/api/discovery/run", dependencies=[Depends(auth)])
async def discovery_run(bg: BackgroundTasks, dnstwist: bool = False):
    if discovery._running.locked():
        return {"status": "already running"}
    bg.add_task(discovery.run_once, dnstwist)
    return {"status": "started"}


@app.get("/api/discovery/enabled", dependencies=[Depends(auth)])
def discovery_enabled():
    return {"enabled": discovery.is_enabled() if DISCOVERY_ENABLED else False, "configurable": DISCOVERY_ENABLED}


@app.post("/api/discovery/enabled", dependencies=[Depends(auth)])
def discovery_set_enabled(body: DiscoveryToggle):
    if not DISCOVERY_ENABLED:
        raise HTTPException(409, "discovery is disabled at the deployment level (DISCOVERY_ENABLED=false)")
    discovery.set_enabled(body.enabled)
    return {"enabled": discovery.is_enabled()}


# ---------------- watchlist ----------------
def _wl_view(wl: dict, extra: dict | None = None) -> dict:
    wb = [b for b in BRANDS if b.get("wl")]
    return {**wl, "brands": len(wb),
            "pairs": {b["text_keywords"][0]: b["official_domains"] for b in wb},
            # crt.sh is only polled for keywords of 4+ characters (ct_monitor.poll); tell the user which miss out.
            "no_ct": [b["text_keywords"][0] for b in wb if not any(len(k) >= 4 for k in b["keywords"])],
            "cursor": db.kv_get("wl_cursor", 0), "slice": WATCHLIST_SLICE, "max_entries": watchlist.MAX_ENTRIES,
            "places": maps.last_status, **(extra or {})}


@app.get("/api/watchlist", dependencies=[Depends(auth)])
def watchlist_get():
    return _wl_view(watchlist.load())


@app.post("/api/watchlist", dependencies=[Depends(auth)])
def watchlist_save(body: WatchlistSave, bg: BackgroundTasks):
    try:
        kws, sites, rejected = watchlist.validate(body.keywords, body.sites)
    except ValueError as e:
        raise HTTPException(400, str(e))
    wl = watchlist.save(kws, sites)
    started = not discovery._running.locked()
    if started:
        bg.add_task(discovery.run_once, False)  # save reset the cursor, so the new entries run first
    return _wl_view(wl, {"rejected": rejected, "run": "started" if started else "already running"})


@app.get("/api/stats", dependencies=[Depends(auth)])
def stats():
    since = (dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=24)).isoformat(timespec="seconds")
    items = [_discovery_item(d) for d in db.list_discoveries(limit=5000)]
    today = [i for i in items if i["detected_at"] >= since]
    by_source = {}
    for i in items:
        by_source[i["source"]] = by_source.get(i["source"], 0) + 1
    total = db.C.execute("SELECT COUNT(*) FROM scans").fetchone()[0]
    return {"found_today": len(today), "high_risk": sum(1 for i in today if (i["score"] or 0) >= scoring.SCAM_AT),
            "brands_targeted": len({i["brand"] for i in today if i["brand"]}), "scans_total": total, "by_source": by_source}


# ---------------- graph ----------------
@app.get("/api/graph", dependencies=[Depends(auth)])
def get_graph():
    return graph.build()


# ---------------- cases ----------------
def _shared_for(case: dict) -> list[dict]:
    ids = set(case["scan_ids"])
    out = []
    for c in graph.build()["clusters"]:
        if c["id"] == case.get("cluster_id") or ids & set(c["scan_ids"]):
            out += c["shared_indicators"]
    return out


def _case_view(case: dict, full=False) -> dict:
    scans = evidence.case_scans(case)
    v = {**case, "domain_count": len(scans), "max_score": max((s["score"] for s in scans), default=0)}
    if full:
        en, ar = evidence.case_summary(case, scans)
        regs = sorted({((s.get("intel") or {}).get("whois") or {}).get("registrar") or "" for s in scans} - {""})
        hosting = sorted({f"{h.get('country')} · {h.get('ip')}" for s in scans if (h := (s.get("intel") or {}).get("hosting") or {}).get("ip")})
        chain = max((s.get("redirect_chain") or [] for s in scans), key=len, default=[])
        v.update(summary_en=en, summary_ar=ar, scans=[summary(s) for s in scans], shared_indicators=_shared_for(case),
                 evidence={"screenshots": sum(len(s.get("screenshots", [])) for s in scans),
                           "whois_records": len(scans), "registrars": regs, "hosting": hosting,
                           "first_seen": min((s["created_at"] for s in scans), default=None),
                           "files": sum(len(s.get("evidence_manifest", [])) for s in scans)},
                 redirect_chain=chain)
    return v


@app.post("/api/cases", dependencies=[Depends(auth)])
def create_case(body: CaseCreate):
    if not body.scan_ids:
        raise HTTPException(400, "scan_ids is empty")
    for sid in body.scan_ids:
        _scan_or_404(sid)
    return _case_view(db.create_case(body.title, body.scan_ids, body.cluster_id), full=True)


@app.get("/api/cases", dependencies=[Depends(auth)])
def cases():
    return [_case_view(c) for c in db.list_cases()]


@app.get("/api/cases/{cid}", dependencies=[Depends(auth)])
def case(cid: str):
    return _case_view(_case_or_404(cid), full=True)


@app.patch("/api/cases/{cid}", dependencies=[Depends(auth)])
def patch_case(cid: str, body: CasePatch):
    _case_or_404(cid)
    fields = body.model_dump(exclude_none=True)
    if "add_scan_ids" in fields:
        c = db.get_case(cid)
        fields["scan_ids"] = list(dict.fromkeys(c["scan_ids"] + fields.pop("add_scan_ids")))
    return _case_view(db.update_case(cid, **fields), full=True)


@app.get("/api/cases/{cid}/report.pdf", dependencies=[Depends(auth)])
async def case_pdf(cid: str):
    c = _case_or_404(cid)
    return Response(await evidence.build_case_pdf(c, _shared_for(c)), media_type="application/pdf",
                    headers={"Content-Disposition": f'attachment; filename="{cid}.pdf"'})


@app.get("/api/cases/{cid}/report.json", dependencies=[Depends(auth)])
def case_json(cid: str):
    c = _case_or_404(cid)
    return Response(evidence.build_json(c, _shared_for(c)), media_type="application/json",
                    headers={"Content-Disposition": f'attachment; filename="{cid}.json"'})

