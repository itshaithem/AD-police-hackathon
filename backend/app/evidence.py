"""Police-ready output: PDF report, machine-readable JSON, takedown draft."""
import base64
import json
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape

from . import db
from .config import EVIDENCE_DIR
from .pipeline import sandbox_client

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
    brands = sorted({(s.get("brand") or {}).get("id", "").upper() for s in scans} - {""})
    top = max((s["score"] for s in scans), default=0)
    regs = sorted({(s.get("intel") or {}).get("whois", {}).get("registrar") or "" for s in scans} - {""})
    en = (f"{n} domain(s) linked in this case{' impersonating ' + ', '.join(brands) if brands else ''}. "
          f"Highest risk score {top}/100.{' Registrar(s): ' + ', '.join(regs) + '.' if regs else ''}")
    ar = (f"{n} نطاق مرتبط بهذه القضية{' ينتحل ' + '، '.join(brands) if brands else ''}. "
          f"أعلى درجة خطورة {top}/100.")
    return en, ar


def _render(title, scans, case=None, shared=None) -> str:
    en, ar = case_summary(case, scans) if case else ("", "")
    return _env.get_template("report.html").render(
        title=title, scans=[_scan_view(s) for s in scans], case=case, shared=shared or [],
        case_summary_en=en, case_summary_ar=ar, generated_at=db.now())


async def build_scan_pdf(scan: dict) -> bytes:
    return await sandbox_client.render_pdf(_render(f"Scan report — {scan['domain']}", [scan]))


async def build_case_pdf(case: dict, shared=None) -> bytes:
    return await sandbox_client.render_pdf(_render(f"Case {case['id']} — {case['title']}", case_scans(case), case, shared))


def build_json(case: dict, shared=None) -> str:
    scans = case_scans(case)
    en, ar = case_summary(case, scans)
    return json.dumps({"case": case, "summary_en": en, "summary_ar": ar, "shared_indicators": shared or [],
                       "scans": scans, "generated_at": db.now()}, indent=1, ensure_ascii=False, default=str)


def takedown_draft(scan: dict) -> str:
    intel = scan.get("intel") or {}
    w, h = intel.get("whois") or {}, intel.get("hosting") or {}
    reasons = "\n".join(f"  - {r['reason_en']}" for r in scan.get("reasons", []))
    hashes = "\n".join(f"  {m['sha256']}  {m['file']}" for m in scan.get("evidence_manifest", []))
    return f"""To: {w.get('abuse_email') or '<registrar abuse contact>'}
Cc: abuse contact of {h.get('org') or '<hosting provider>'} (AS{h.get('asn') or '?'})
Subject: Fraudulent website impersonating {((scan.get('brand') or {}).get('id') or 'a UAE organisation').upper()} — takedown request ({scan['domain']})

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
