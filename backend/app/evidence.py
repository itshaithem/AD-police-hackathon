"""Police-ready output: PDF report, machine-readable JSON, takedown draft."""
import base64
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import db
from .config import EVIDENCE_DIR
from .pipeline import sandbox_client
from .pipeline.url_features import brand_label

_env = Environment(loader=FileSystemLoader(Path(__file__).parent / "templates"), autoescape=select_autoescape(["html"]))


def _scan_view(scan: dict) -> dict:
    """Scan dict plus inlined screenshots for the report."""
    shots = []
    for sh in scan.get("screenshots", []):
        p = EVIDENCE_DIR / scan["id"] / f"screenshot_{sh['index']}.png"
        if p.exists():
            shots.append({**sh, "src": "data:image/png;base64," + base64.b64encode(p.read_bytes()).decode()})
    return {**scan, "shots": shots, "intel": scan.get("intel") or {}}


def case_scans(case: dict) -> list[dict]:
    return [s for s in (db.get_scan(i) for i in case["scan_ids"]) if s]


def case_summary(case: dict, scans: list[dict]) -> tuple[str, str]:
    """Template summary in EN and AR; uses the first LLM summary if one exists."""
    for s in scans:
        lm = s.get("llm") or {}
        if lm.get("summary_en") and lm.get("summary_ar"):
            return lm["summary_en"], lm["summary_ar"]
    n = len(scans)
    brands = sorted({brand_label((s.get("brand") or {}).get("id")) for s in scans} - {""})
    top = max((s["score"] for s in scans), default=0)
    regs = sorted({(s.get("intel") or {}).get("whois", {}).get("registrar") or "" for s in scans} - {""})
    en = (f"{n} domain(s) linked in this case{' impersonating ' + ', '.join(brands) if brands else ''}. "
          f"Highest risk score {top}/100.{' Registrar(s): ' + ', '.join(regs) + '.' if regs else ''}")
    ar = (f"{n} نطاق مرتبط بهذه القضية{' ينتحل ' + '، '.join(brands) if brands else ''}. "
          f"أعلى درجة خطورة {top}/100.")
    return en, ar


def _render(title, scans, case=None, shared=None, sweep=None) -> str:
    en, ar = case_summary(case, scans) if case else ("", "")
    return _env.get_template("report.html").render(
        title=title, scans=[_scan_view(s) for s in scans], case=case, shared=shared or [], sweep=sweep,
        case_summary_en=en, case_summary_ar=ar, generated_at=db.now())


async def build_scan_pdf(scan: dict) -> bytes:
    g = scan.get("listing")
    title = f"Maps listing report — {g['name']}" if g else f"Scan report — {scan['domain']}"
    return await sandbox_client.render_pdf(_render(title, [scan]))


async def build_sweep_pdf(sweep: dict, scans: list[dict]) -> bytes:
    """One report for a whole Maps search: what was checked, and every impersonating listing."""
    return await sandbox_client.render_pdf(
        _render(f"Maps search report — {sweep['query']}", scans, sweep=sweep))


async def build_case_pdf(case: dict, shared=None) -> bytes:
    return await sandbox_client.render_pdf(_render(f"Case {case['id']} — {case['title']}", case_scans(case), case, shared))


def build_json(case: dict, shared=None) -> str:
    scans = case_scans(case)
    en, ar = case_summary(case, scans)
    return json.dumps({"case": case, "summary_en": en, "summary_ar": ar, "shared_indicators": shared or [],
                       "scans": scans, "generated_at": db.now()}, indent=1, ensure_ascii=False, default=str)


def takedown_draft(scan: dict) -> str:
    if scan.get("listing"):
        return _listing_takedown(scan)
    intel = scan.get("intel") or {}
    w, h = intel.get("whois") or {}, intel.get("hosting") or {}
    reasons = "\n".join(f"  - {r['reason_en']}" for r in scan.get("reasons", []))
    hashes = "\n".join(f"  {m['sha256']}  {m['file']}" for m in scan.get("evidence_manifest", []))
    return f"""To: {w.get('abuse_email') or '<registrar abuse contact>'}
Cc: abuse contact of {h.get('org') or '<hosting provider>'} (AS{h.get('asn') or '?'})
Subject: Fraudulent website impersonating {brand_label((scan.get('brand') or {}).get('id')) or 'A UAE ORGANISATION'} — takedown request ({scan['domain']})

Dear Abuse Team,

We are reporting a fraudulent website targeting residents of the United Arab Emirates.

URL:            {scan['url']}
Final URL:      {scan.get('final_url')}
Domain:         {scan['domain']}
Hosting IP:     {h.get('ip') or 'n/a'} ({h.get('country') or 'n/a'})
Registrar:      {w.get('registrar') or 'n/a'}
Detected (UTC): {scan['created_at']}
Risk score:     {scan['score']}/100 ({scan['verdict']})

Why this site is fraudulent:
{reasons}

Evidence (SHA-256 of files captured in an isolated sandbox):
{hashes}

Redirect chain: {' -> '.join(scan.get('redirect_chain') or []) or 'none'}

We request that this domain/hosting be suspended. Full evidence is available on request.

ScamShield AI — on behalf of Abu Dhabi Police
"""


def _listing_takedown(scan: dict) -> str:
    """A fake Maps listing is removed by Google, so this draft is addressed there, not to a registrar."""
    g = scan["listing"]
    reasons = "\n".join(f"  - {r['reason_en']}" for r in scan.get("reasons", []))
    return f"""To: Google Maps — Business Redressal / Report a problem
Subject: Fraudulent Google Maps listing impersonating {brand_label((scan.get('brand') or {}).get('id')) or 'A UAE ORGANISATION'} — removal request

Dear Google Trust & Safety Team,

We are reporting a Google Maps listing that impersonates a UAE organisation in order to
intercept customers seeking its official support channels.

Listing name:    {g['name']}
Address:         {g.get('address') or 'n/a'}
Listed phone:    {g.get('phone') or 'n/a'}   (official: {g['official_phones']})
Listed website:  {g.get('website') or 'n/a'}   (official: {g['official_domains']})
Google Maps URL: {g.get('maps_url') or 'n/a'}
Place ID:        {g['place_id']}
Found via:       "{g['query']}"
Checked (UTC):   {scan['created_at']}
Risk score:      {scan['score']}/100 ({scan['verdict']})

Why this listing is fraudulent:
{reasons}

We request that this listing be removed. Full evidence is available on request.

ScamShield AI — on behalf of Abu Dhabi Police
"""
