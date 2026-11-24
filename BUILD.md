# ScamShield AI — Full Build Spec (Backend + Frontend Integration)

> Hackathon: **SCAMSHIELD AI — Abu Dhabi Police × 42 Abu Dhabi**
> Submission deadline: **25 Nov 2026, 08:00 (Podium+)** · Pitch: 26 Nov (3 min demo + 2 min Q&A)
> Goal of this document: give a builder (human or Claude Code) everything needed to ship a **real, working** system tonight, wired to the existing Claude Design front end.

---

## 0. How to use this file

1. Create an empty repo `scamshield-ai` (branch **`master`**, which the submission rules require).
2. Put this file at the repo root as `BUILD.md`.
3. If using Claude Code: give it this file and say *"Build this, phase by phase, in the order of section 14. Test every phase before moving on."*
4. **Front end:** import the Claude Design project (`ScamShield Dashboard.dc.html` + `support.js`) into `frontend/` and follow **section 11** to wire it to the API. **Do not redesign it**; only replace mock data with API calls.

---

## 1. Judging criteria → what we build

| Criterion | Weight | Delivered by |
|---|---|---|
| Detection Accuracy (precision/recall on a hidden URL set, low false positives, resists redirects/shorteners/cloaking) | **30%** | `scan` pipeline: URL features + ML + network intel + sandbox + content + visual + LLM → explainable score. Official-domain allowlist. Batch CSV mode. |
| Early Detection & Coverage (new domains, look-alikes, fresh ads, Search **and** Maps) | **25%** | Discovery workers: Certificate Transparency (crt.sh), look-alike generator (dnstwist), Search (SerpAPI), Maps (Google Places) |
| Explainability & Actionability (risk score + reasons, police-ready evidence, exportable for takedown) | **20%** | Noisy-OR scoring with bilingual reasons, evidence folder with SHA-256 manifest, PDF + JSON export, abuse-contact takedown draft |
| UAE Relevance & Innovation (Arabic, local brands, visual similarity, LLM, domain networks) | **15%** | UAE brand registry, Arabic keywords, CLIP visual similarity, local SLM analysis (Arabic/English), fraud network graph, sandboxed "fake victim" agent |
| Feasibility & Presentation (live demo, scalable, police pilot path, honest limits) | **10%** | docker compose, sandbox isolation, demo mode + seeded data, `/health`, README limitations section |

---

## 2. Architecture

```
            ┌───────────────────────────────────────────┐
 Browser ──▶│ frontend/ (Claude Design dashboard)        │  static: nginx or Vercel
            │ Scan · Discovery · Network · Reports        │
            └──────────────────┬────────────────────────┘
                               │ REST JSON  (X-API-Key)
            ┌──────────────────▼────────────────────────┐
            │ backend/  FastAPI  (Python 3.11)           │
            │  pipeline: features → intel → sandbox →    │
            │            content → visual → LLM → score  │
            │  discovery loop (CT, lookalikes, search,   │
            │            maps) → auto-scan queue         │
            │  graph (networkx) · evidence (PDF/JSON)    │
            │  SQLite + /data/evidence/<scan_id>/        │
            └───────┬───────────────────────┬───────────┘
                    │ internal network       │
     ┌──────────────▼─────────┐   ┌──────────▼──────────┐
     │ sandbox/  Playwright   │   │ ollama (optional)    │
     │ fresh browser per scan │   │ qwen3:4b / Falcon    │
     │ read-only, no caps,    │   │ local SLM, no data   │
     │ mem/cpu/pid limits     │   │ leaves the server    │
     └────────────────────────┘   └─────────────────────┘
     demo-sites/ (nginx, LOCAL ONLY, fictional brand test pages)
```

**Key rule:** the investigator never opens a suspicious link. Only the sandbox does. The UI only shows screenshots and extracted evidence.

---

## 3. Repository layout

```
scamshield-ai/
├── BUILD.md
├── README.md                      # submission README (section 15)
├── docker-compose.yml
├── .env.example
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py                # FastAPI app + routes
│       ├── config.py
│       ├── db.py
│       ├── schemas.py             # API contract (section 10)
│       ├── brands.yaml            # UAE brand registry + allowlist
│       ├── pipeline/
│       │   ├── __init__.py        # run_scan()
│       │   ├── url_features.py
│       │   ├── network_intel.py   # DNS, RDAP/WHOIS, TLS, IP/ASN
│       │   ├── sandbox_client.py
│       │   ├── content.py         # forms, keywords, brand mentions, phones
│       │   ├── visual.py          # CLIP similarity vs reference pages
│       │   ├── llm.py             # Ollama SLM analysis (AR/EN)
│       │   ├── ml_model.py        # optional trained URL classifier
│       │   └── scoring.py         # noisy-OR + reasons
│       ├── discovery/
│       │   ├── ct_monitor.py
│       │   ├── lookalikes.py
│       │   ├── search.py
│       │   ├── maps.py
│       │   └── loop.py
│       ├── graph.py
│       ├── evidence.py            # manifest, PDF, JSON, takedown draft
│       ├── templates/report.html
│       ├── cli.py                 # batch scoring for the hidden test set
│       ├── eval.py                # precision / recall / F1 / FPR
│       ├── train_url_model.py
│       ├── capture_refs.py        # screenshots of official pages
│       └── seed_demo.py
├── sandbox/
│   ├── Dockerfile
│   └── server.py
├── frontend/
│   ├── ScamShield Dashboard.dc.html   # from Claude Design (keep design)
│   ├── support.js                     # from Claude Design
│   └── api.js                         # NEW: API layer (section 11)
├── demo-sites/                     # fictional brand test pages (section 12)
│   ├── saqrbank.test/index.html
│   └── saqrbank-secure-login.test/index.html (+ step2.html)
└── data/
    ├── references/                 # official page screenshots per brand
    ├── eval/labeled.csv
    └── evidence/                   # generated
```

---

## 4. Environment (`.env.example`)

```bash
API_KEY=change-me                  # frontend sends X-API-Key
CORS_ORIGINS=http://localhost:8080,https://your-app.vercel.app
DATA_DIR=/data
SANDBOX_URL=http://sandbox:9000
OLLAMA_URL=http://ollama:11434
OLLAMA_MODEL=qwen3:4b              # or a Falcon-H1-Arabic GGUF if you have it working
LLM_ENABLED=true
VISUAL_ENABLED=true
AGENT_ENABLED=false                # true only for demo-sites / authorised targets
SERPAPI_KEY=
GOOGLE_PLACES_KEY=
DISCOVERY_INTERVAL_MIN=20
DISCOVERY_ENABLED=true
DEMO_MODE=false                    # true = serve cached results first
SCAN_CONCURRENCY=3
```

---

## 5. `docker-compose.yml`

```yaml
services:
  backend:
    build: ./backend
    env_file: .env
    ports: ["8000:8000"]
    volumes: ["./data:/data"]
    depends_on: [sandbox]
    networks: [internal, egress]

  sandbox:
    build: ./sandbox
    read_only: true
    tmpfs: ["/tmp:size=512m"]
    cap_drop: [ALL]
    security_opt: ["no-new-privileges:true"]
    mem_limit: 2g
    cpus: 1.5
    pids_limit: 300
    environment: [HOME=/tmp]
    networks:
      internal: {}
      egress: {}
    restart: unless-stopped

  ollama:
    image: ollama/ollama
    volumes: ["ollama:/root/.ollama"]
    networks: [internal]
    profiles: ["llm"]           # docker compose --profile llm up

  frontend:
    image: nginx:alpine
    volumes: ["./frontend:/usr/share/nginx/html:ro"]
    ports: ["8080:80"]

  demo-sites:                    # LOCAL ONLY — never expose publicly
    image: nginx:alpine
    volumes: ["./demo-sites:/sites:ro", "./demo-sites/nginx.conf:/etc/nginx/conf.d/default.conf:ro"]
    networks:
      egress:
        aliases: [saqrbank.test, saqrbank-secure-login.test]

networks:
  internal: { internal: true }   # no internet; backend <-> sandbox <-> ollama
  egress: {}                     # internet access

volumes:
  ollama: {}
```

> After `docker compose --profile llm up -d`, run `docker compose exec ollama ollama pull qwen3:4b`.
> **Known limitation (put it in the README):** sandbox shares one long-running container with a fresh browser per scan. Production design = one disposable container or Firecracker microVM per scan, behind a UAE residential/mobile proxy.

---

## 6. Sandbox service (`sandbox/`)

### `sandbox/Dockerfile`
```dockerfile
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy
WORKDIR /app
RUN pip install --no-cache-dir fastapi==0.115.* uvicorn==0.30.* httpx==0.27.*
COPY server.py .
USER pwuser
CMD ["uvicorn", "server:app", "--host", "0.0.0.0", "--port", "9000"]
```
(Pin the Playwright image tag to the same version as the `playwright` pip package it ships with.)

### `sandbox/server.py`
```python
import asyncio, base64, hashlib, re
import httpx
from fastapi import FastAPI
from pydantic import BaseModel
from playwright.async_api import async_playwright

app = FastAPI()

CANARY = {  # fake data only, never real
    "name": "Test User", "email": "canary.test@example.com", "phone": "0500000000",
    "card": "4111111111111111", "cvv": "123", "exp": "12/29", "otp": "000000",
    "plate": "12345", "eid": "784-0000-0000000-0", "password": "Canary!2026", "text": "test",
}
SUBMIT_WORDS = re.compile(r"(pay|continue|next|submit|login|sign in|verify|confirm|"
                          r"ادفع|دفع|متابعة|التالي|تسجيل|دخول|تأكيد|إرسال)", re.I)

FORM_JS = """
() => [...document.querySelectorAll('input,select,textarea')].filter(e => e.offsetParent !== null)
  .map(e => ({tag:e.tagName.toLowerCase(), type:(e.type||'').toLowerCase(), name:e.name||'',
     id:e.id||'', placeholder:e.placeholder||'', autocomplete:e.autocomplete||'',
     maxlength:e.maxLength||null, label:(e.labels&&e.labels[0]?e.labels[0].innerText:'')}))
"""

class VisitReq(BaseModel):
    url: str
    agent: bool = False
    timeout_ms: int = 25000

def canary_for(f: dict) -> str:
    s = " ".join([f.get(k, "") or "" for k in ("type","name","id","placeholder","autocomplete","label")]).lower()
    if f["type"] == "password": return CANARY["password"]
    if any(k in s for k in ("cvv","cvc","csc")): return CANARY["cvv"]
    if any(k in s for k in ("cc-number","card","pan","بطاقة")): return CANARY["card"]
    if any(k in s for k in ("exp","انتهاء")): return CANARY["exp"]
    if any(k in s for k in ("otp","code","رمز","verification")): return CANARY["otp"]
    if any(k in s for k in ("emirates","eid","هوية","784")): return CANARY["eid"]
    if any(k in s for k in ("plate","لوحة")): return CANARY["plate"]
    if f["type"] == "email" or "mail" in s: return CANARY["email"]
    if f["type"] == "tel" or any(k in s for k in ("phone","mobile","هاتف","جوال")): return CANARY["phone"]
    if any(k in s for k in ("name","اسم")): return CANARY["name"]
    return CANARY["text"]

async def snapshot(page, label):
    png = await page.screenshot(full_page=False)
    try: text = (await page.inner_text("body"))[:20000]
    except Exception: text = ""
    return {"label": label, "url": page.url, "title": await page.title(),
            "png_b64": base64.b64encode(png).decode(), "text": text,
            "forms": await page.evaluate(FORM_JS)}

async def bot_view(url: str):
    """Fetch as a crawler to detect cloaking (content shown to bots vs phones)."""
    try:
        async with httpx.AsyncClient(follow_redirects=True, timeout=12, verify=False,
              headers={"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"}) as c:
            r = await c.get(url)
            return {"final_url": str(r.url), "status": r.status_code, "length": len(r.text),
                    "sha256": hashlib.sha256(r.content).hexdigest()}
    except Exception as e:
        return {"error": str(e)}

@app.get("/health")
async def health(): return {"ok": True}

@app.post("/visit")
async def visit(req: VisitReq):
    out = {"requested_url": req.url, "redirect_chain": [], "network": [], "steps": [], "error": None}
    bot_task = asyncio.create_task(bot_view(req.url))
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        ctx = await browser.new_context(**p.devices["iPhone 13"], locale="ar-AE",
                                        timezone_id="Asia/Dubai", ignore_https_errors=True)
        page = await ctx.new_page()
        page.on("request", lambda r: len(out["network"]) < 400 and out["network"].append(
            {"url": r.url, "method": r.method, "type": r.resource_type}))
        try:
            resp = await page.goto(req.url, wait_until="domcontentloaded", timeout=req.timeout_ms)
            r = resp.request if resp else None
            chain = []
            while r: chain.insert(0, r.url); r = r.redirected_from
            await page.wait_for_timeout(2500)          # allow JS redirects
            if page.url not in chain: chain.append(page.url)
            out["redirect_chain"] = chain
            out["status"] = resp.status if resp else None
            out["final_url"] = page.url
            out["html_sha256"] = hashlib.sha256((await page.content()).encode()).hexdigest()
            out["html"] = (await page.content())[:300000]
            out["steps"].append(await snapshot(page, "landing"))

            if req.agent:                                # "fake victim" walk-through, max 3 steps
                for i in range(3):
                    fields = page.locator("input:visible, textarea:visible")
                    n = await fields.count()
                    if n == 0: break
                    forms = await page.evaluate(FORM_JS)
                    for j in range(min(n, 12)):
                        f = forms[j] if j < len(forms) else {"type": "text"}
                        if f.get("type") in ("checkbox","radio","hidden","submit","button"): continue
                        try: await fields.nth(j).fill(canary_for(f), timeout=2000)
                        except Exception: pass
                    btn = page.locator("button:visible, input[type=submit]:visible, a[role=button]:visible")
                    clicked = False
                    for k in range(await btn.count()):
                        b = btn.nth(k)
                        label = ((await b.inner_text()) if await b.evaluate("e=>e.tagName")!="INPUT"
                                 else (await b.get_attribute("value") or ""))
                        if SUBMIT_WORDS.search(label or ""):
                            await b.click(timeout=3000); clicked = True; break
                    if not clicked: break
                    await page.wait_for_timeout(2500)
                    out["steps"].append(await snapshot(page, f"agent_step_{i+1}"))
        except Exception as e:
            out["error"] = str(e)[:500]
        finally:
            await ctx.close(); await browser.close()
    out["bot_view"] = await bot_task
    return out
```

---

## 7. Backend

### 7.1 `backend/requirements.txt`
```
fastapi==0.115.*
uvicorn[standard]==0.30.*
httpx==0.27.*
pydantic==2.*
python-multipart
pyyaml
tldextract
rapidfuzz
dnspython
cryptography>=42
networkx
jinja2
weasyprint
pillow
imagehash
dnstwist
scikit-learn
joblib
pandas
sentence-transformers      # CLIP (install CPU torch first, see Dockerfile)
```

### 7.2 `backend/Dockerfile`
```dockerfile
FROM python:3.11-slim
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b fonts-dejavu-core fonts-noto-core \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /srv
RUN pip install --no-cache-dir torch --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
# pre-download CLIP so the demo doesn't wait
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('clip-ViT-B-32')"
COPY app ./app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

### 7.3 `app/config.py`
```python
import os
from pathlib import Path
def env(k, d=None): return os.getenv(k, d)
def flag(k, d="false"): return env(k, d).lower() in ("1","true","yes")
API_KEY = env("API_KEY", "change-me")
CORS_ORIGINS = [o.strip() for o in env("CORS_ORIGINS", "*").split(",")]
DATA_DIR = Path(env("DATA_DIR", "./data")); EVIDENCE_DIR = DATA_DIR / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
SANDBOX_URL = env("SANDBOX_URL", "http://localhost:9000")
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434"); OLLAMA_MODEL = env("OLLAMA_MODEL", "qwen3:4b")
LLM_ENABLED, VISUAL_ENABLED, AGENT_ENABLED = flag("LLM_ENABLED","true"), flag("VISUAL_ENABLED","true"), flag("AGENT_ENABLED")
SERPAPI_KEY, GOOGLE_PLACES_KEY = env("SERPAPI_KEY"), env("GOOGLE_PLACES_KEY")
DISCOVERY_ENABLED = flag("DISCOVERY_ENABLED","true"); DISCOVERY_INTERVAL_MIN = int(env("DISCOVERY_INTERVAL_MIN","20"))
DEMO_MODE = flag("DEMO_MODE"); SCAN_CONCURRENCY = int(env("SCAN_CONCURRENCY","3"))
```

### 7.4 `app/brands.yaml` — UAE brand registry & allowlist
> ⚠️ **Verify every domain and phone number against the brand's official website before the demo.** Wrong allowlist entries = false positives = lost accuracy points. Fill `phones` from official sites only; leave empty if unsure.

```yaml
brands:
  - id: adcb
    name: {en: "ADCB", ar: "بنك أبوظبي التجاري"}
    official_domains: [adcb.com]
    keywords: [adcb]
    text_keywords: ["ADCB", "Abu Dhabi Commercial Bank", "بنك أبوظبي التجاري"]
    phones: []
  - id: tamm
    name: {en: "TAMM", ar: "تم"}
    official_domains: [tamm.abudhabi]
    keywords: [tamm]
    text_keywords: ["TAMM", "تم أبوظبي"]
    phones: []
  - id: uaepass
    name: {en: "UAE PASS", ar: "الهوية الرقمية"}
    official_domains: [uaepass.ae]
    keywords: [uaepass, uae-pass]
    text_keywords: ["UAE PASS", "الهوية الرقمية"]
    phones: []
  - id: adpolice
    name: {en: "Abu Dhabi Police", ar: "شرطة أبوظبي"}
    official_domains: [adpolice.gov.ae]
    keywords: [adpolice, abudhabipolice, adp-fines]
    text_keywords: ["Abu Dhabi Police", "شرطة أبوظبي"]
    phones: []
  - id: emiratesnbd
    name: {en: "Emirates NBD", ar: "بنك الإمارات دبي الوطني"}
    official_domains: [emiratesnbd.com]
    keywords: [emiratesnbd, enbd]
    text_keywords: ["Emirates NBD"]
    phones: []
  - id: fab
    name: {en: "First Abu Dhabi Bank", ar: "بنك أبوظبي الأول"}
    official_domains: [bankfab.com]
    keywords: [bankfab, fab-bank]
    text_keywords: ["First Abu Dhabi Bank", "بنك أبوظبي الأول"]
    phones: []
  - id: adib
    name: {en: "ADIB", ar: "مصرف أبوظبي الإسلامي"}
    official_domains: [adib.ae]
    keywords: [adib]
    text_keywords: ["ADIB", "مصرف أبوظبي الإسلامي"]
    phones: []
  - id: mashreq
    name: {en: "Mashreq", ar: "المشرق"}
    official_domains: [mashreq.com]
    keywords: [mashreq]
    text_keywords: ["Mashreq"]
    phones: []
  - id: emiratespost
    name: {en: "Emirates Post", ar: "بريد الإمارات"}
    official_domains: [emiratespost.ae]
    keywords: [emiratespost, empost]
    text_keywords: ["Emirates Post", "بريد الإمارات"]
    phones: []
  - id: salik
    name: {en: "Salik", ar: "سالك"}
    official_domains: [salik.ae]
    keywords: [salik]
    text_keywords: ["Salik", "سالك"]
    phones: []
  - id: etisalat
    name: {en: "e& (Etisalat)", ar: "اتصالات"}
    official_domains: [etisalat.ae, eand.com]
    keywords: [etisalat]
    text_keywords: ["Etisalat", "اتصالات"]
    phones: []
  - id: uaegov
    name: {en: "UAE Government", ar: "حكومة الإمارات"}
    official_domains: [u.ae, moi.gov.ae]
    keywords: [uae-gov, moi-uae]
    text_keywords: ["Ministry of Interior", "وزارة الداخلية"]
    phones: []
  # FICTIONAL demo brand (section 12) — safe to show live
  - id: saqrbank
    name: {en: "Saqr Bank (fictional demo brand)", ar: "بنك صقر (علامة تجريبية)"}
    official_domains: [saqrbank.test]
    keywords: [saqrbank, saqr-bank]
    text_keywords: ["Saqr Bank", "بنك صقر"]
    phones: ["0400000000"]

# Always-safe domains (extend with Tranco top sites for fewer false positives)
extra_allowlist: [google.com, apple.com, microsoft.com, gov.ae]
allowlist_suffixes: [".gov.ae"]          # any *.gov.ae is official

suspicious_tlds: [xyz, top, icu, shop, online, click, live, cfd, sbs, info, buzz, rest, monster, lol, support, help, site, website, cyou]
free_hosts: [vercel.app, netlify.app, github.io, pages.dev, web.app, firebaseapp.com, weebly.com, wixsite.com, 000webhostapp.com, glitch.me, blogspot.com, sites.google.com, workers.dev, onrender.com]
shorteners: [bit.ly, tinyurl.com, t.co, rebrand.ly, cutt.ly, is.gd, s.id, shorturl.at, rb.gy, t.ly, ow.ly, goo.su]
urgency_keywords:
  en: [urgent, suspended, blocked, verify your, update your, final notice, unpaid, fine, penalty, expire, within 24 hours, refund, prize]
  ar: [عاجل, مخالفة, غرامة, سيتم إيقاف, تم إيقاف, تحديث بياناتك, تحديث البيانات, إشعار نهائي, مستحقات, استرداد, جائزة, خلال 24 ساعة, تحقق]
```

### 7.5 `app/db.py`
```python
import json, sqlite3, threading, uuid, datetime as dt
from .config import DATA_DIR
_DB = DATA_DIR / "scamshield.db"; _lock = threading.Lock()

def conn():
    c = sqlite3.connect(_DB, check_same_thread=False); c.row_factory = sqlite3.Row; return c
C = conn()
C.executescript("""
CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY, url TEXT, final_url TEXT, domain TEXT,
  score INT, verdict TEXT, brand TEXT, source TEXT, created_at TEXT, result TEXT);
CREATE INDEX IF NOT EXISTS ix_scans_domain ON scans(domain);
CREATE TABLE IF NOT EXISTS discoveries(id TEXT PRIMARY KEY, source TEXT, item TEXT, kind TEXT,
  brand TEXT, detected_at TEXT, scan_id TEXT, meta TEXT, UNIQUE(source,item));
CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, title TEXT, status TEXT, created_at TEXT, scan_ids TEXT);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT, total INT, done INT, created_at TEXT, out_path TEXT);
""")
def now(): return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
def new_id(p): return f"{p}_{uuid.uuid4().hex[:10]}"

def save_scan(r: dict):
    with _lock:
        C.execute("INSERT OR REPLACE INTO scans VALUES(?,?,?,?,?,?,?,?,?,?)",
          (r["id"], r["url"], r.get("final_url"), r.get("domain"), r["score"], r["verdict"],
           (r.get("brand") or {}).get("id"), r.get("source","manual"), r["created_at"], json.dumps(r)))
        C.commit()
def get_scan(sid):
    row = C.execute("SELECT result FROM scans WHERE id=?", (sid,)).fetchone()
    return json.loads(row["result"]) if row else None
def latest_scan_for_domain(domain):
    row = C.execute("SELECT result FROM scans WHERE domain=? ORDER BY created_at DESC LIMIT 1", (domain,)).fetchone()
    return json.loads(row["result"]) if row else None
def list_scans(limit=100, min_score=0):
    rows = C.execute("SELECT result FROM scans WHERE score>=? ORDER BY created_at DESC LIMIT ?", (min_score, limit))
    return [json.loads(r["result"]) for r in rows]
```
(Add similar small helpers for `discoveries`, `cases`, `jobs`.)

### 7.6 `app/pipeline/url_features.py`
```python
import math, re, ipaddress, yaml
from pathlib import Path
from urllib.parse import urlsplit
import tldextract
from rapidfuzz.distance import Levenshtein

CFG = yaml.safe_load((Path(__file__).parent.parent / "brands.yaml").read_text(encoding="utf-8"))
BRANDS = CFG["brands"]
EXTRACT = tldextract.TLDExtract(suffix_list_urls=())        # offline snapshot
CONFUSABLE = str.maketrans({"а":"a","е":"e","о":"o","р":"p","с":"c","х":"x","і":"i","ӏ":"l","ј":"j",
                            "0":"o","1":"l","3":"e","5":"s","$":"s","@":"a"})

def normalize_url(u: str) -> str:
    u = u.strip()
    return u if re.match(r"^[a-z][a-z0-9+.-]*://", u, re.I) else "http://" + u

def registered_domain(host: str) -> str:
    e = EXTRACT(host); return e.top_domain_under_public_suffix if hasattr(e, "top_domain_under_public_suffix") else e.registered_domain

def official_brand(domain: str):
    d = domain.lower()
    for b in BRANDS:
        for od in b["official_domains"]:
            if d == od or d.endswith("." + od): return b
    return None

def is_allowlisted(domain: str) -> bool:
    d = domain.lower()
    if official_brand(d): return True
    if any(d == a or d.endswith("." + a) for a in CFG["extra_allowlist"]): return True
    return any(d.endswith(s) for s in CFG["allowlist_suffixes"])

def entropy(s):
    if not s: return 0.0
    p = [s.count(c) / len(s) for c in set(s)]; return -sum(x * math.log2(x) for x in p)

def skeleton(s: str) -> str:
    try: s = s.encode().decode("idna") if "xn--" in s else s
    except Exception: pass
    return s.lower().translate(CONFUSABLE).replace("rn", "m").replace("vv", "w")

def brand_match(host: str):
    """Return (brand, kind, detail) if the host imitates a brand."""
    labels = re.split(r"[.\-_]", skeleton(host))
    raw = host.lower()
    for b in BRANDS:
        for kw in b["keywords"]:
            k = kw.replace("-", "")
            if kw in raw or k in skeleton(host).replace("-", ""):
                kind = "homoglyph" if kw not in raw else "keyword"
                return b, kind, kw
            for lab in labels:
                if len(lab) >= 4 and 0 < Levenshtein.distance(lab, k) <= (1 if len(k) <= 5 else 2):
                    return b, "typosquat", f"{lab}≈{k}"
    return None, None, None

def extract(url: str) -> dict:
    url = normalize_url(url); p = urlsplit(url); host = (p.hostname or "").lower()
    rd = registered_domain(host) or host; ext = EXTRACT(host)
    try: ipaddress.ip_address(host); is_ip = True
    except ValueError: is_ip = False
    brand, kind, detail = brand_match(host)
    return {
        "url": url, "host": host, "domain": rd, "tld": ext.suffix, "scheme": p.scheme,
        "is_ip": is_ip, "punycode": "xn--" in host, "subdomain_depth": len([x for x in ext.subdomain.split(".") if x]),
        "url_len": len(url), "host_len": len(host), "digits": sum(c.isdigit() for c in host),
        "hyphens": host.count("-"), "entropy": round(entropy(host), 3), "has_at": "@" in url,
        "path_len": len(p.path), "query_len": len(p.query),
        "suspicious_tld": ext.suffix.split(".")[-1] in CFG["suspicious_tlds"],
        "free_host": any(host == f or host.endswith("." + f) for f in CFG["free_hosts"]),
        "shortener": rd in CFG["shorteners"],
        "allowlisted": is_allowlisted(rd), "official_brand": (official_brand(rd) or {}).get("id"),
        "brand_imitation": {"brand": brand["id"], "kind": kind, "detail": detail} if brand and not is_allowlisted(rd) else None,
        "keywords": [w for w in ("login","verify","secure","update","account","pay","fine","refund","otp","wallet") if w in url.lower()],
    }
```

### 7.7 `app/pipeline/network_intel.py`
```python
import asyncio, socket, ssl, datetime as dt
import dns.asyncresolver, httpx
from cryptography import x509

async def resolve(host):
    out = {"a": [], "mx": [], "ns": []}
    r = dns.asyncresolver.Resolver(); r.lifetime = 4
    for t, k in (("A","a"),("MX","mx"),("NS","ns")):
        try: out[k] = [x.to_text() for x in await r.resolve(host, t)]
        except Exception: pass
    return out

async def rdap(domain):
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            j = (await c.get(f"https://rdap.org/domain/{domain}")).json()
        ev = {e.get("eventAction"): e.get("eventDate") for e in j.get("events", [])}
        registrar, abuse = None, None
        for ent in j.get("entities", []):
            if "registrar" in ent.get("roles", []):
                registrar = next((v[3] for v in ent.get("vcardArray", [None, []])[1] if v[0] == "fn"), None)
                for sub in ent.get("entities", []):
                    if "abuse" in sub.get("roles", []):
                        abuse = next((v[3] for v in sub.get("vcardArray", [None, []])[1] if v[0] == "email"), None)
        created = ev.get("registration")
        age = None
        if created:
            age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(created.replace("Z", "+00:00"))).days
        return {"created": created, "age_days": age, "registrar": registrar, "abuse_email": abuse,
                "nameservers": [n.get("ldhName") for n in j.get("nameservers", [])], "raw_source": "rdap.org"}
    except Exception as e:
        return {"error": str(e)[:200]}

def _tls(host):
    ctx = ssl.create_default_context(); ctx.check_hostname = False; ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, 443), timeout=5) as s, ctx.wrap_socket(s, server_hostname=host) as ss:
        cert = x509.load_der_x509_certificate(ss.getpeercert(binary_form=True))
    nb = cert.not_valid_before_utc
    return {"issuer": cert.issuer.rfc4514_string(), "subject": cert.subject.rfc4514_string(),
            "not_before": nb.isoformat(), "serial": format(cert.serial_number, "x"),
            "cert_age_days": (dt.datetime.now(dt.timezone.utc) - nb).days}

async def tls(host):
    try: return await asyncio.to_thread(_tls, host)
    except Exception as e: return {"error": str(e)[:200]}

async def ip_info(ip):
    try:
        async with httpx.AsyncClient(timeout=6) as c:
            j = (await c.get(f"https://ipwho.is/{ip}")).json()
        con = j.get("connection", {})
        return {"ip": ip, "country": j.get("country"), "country_code": j.get("country_code"),
                "asn": con.get("asn"), "org": con.get("org") or con.get("isp")}
    except Exception as e:
        return {"ip": ip, "error": str(e)[:200]}

async def gather(host, domain):
    d, w, t = await asyncio.gather(resolve(host), rdap(domain), tls(host))
    ipi = await ip_info(d["a"][0]) if d["a"] else {}
    return {"dns": d, "whois": w, "tls": t, "hosting": ipi}
```

### 7.8 `app/pipeline/sandbox_client.py`
```python
import httpx
from ..config import SANDBOX_URL, AGENT_ENABLED
async def visit(url: str, agent: bool = False):
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{SANDBOX_URL}/visit", json={"url": url, "agent": agent and AGENT_ENABLED})
            return r.json()
    except Exception as e:
        return {"error": f"sandbox unavailable: {e}"[:300], "steps": [], "redirect_chain": []}
```

### 7.9 `app/pipeline/content.py`
```python
import re
from .url_features import CFG, BRANDS
PHONE_RE = re.compile(r"(?:\+?971|00971|0)\s?(?:5\d|[2-9])[\s-]?\d{3}[\s-]?\d{4}")

def analyze(steps: list, domain_is_official: bool) -> dict:
    forms = [f for s in steps for f in s.get("forms", [])]
    text = " ".join(s.get("text", "") for s in steps)
    title = " ".join(s.get("title", "") for s in steps)
    def has(*keys):
        return any(any(k in " ".join(str(f.get(x, "")) for x in ("type","name","id","placeholder","autocomplete","label")).lower()
                       for k in keys) for f in forms)
    asks = {
        "password": any(f.get("type") == "password" for f in forms),
        "card": has("cc-number", "card", "بطاقة", "pan") ,
        "cvv": has("cvv", "cvc", "csc"),
        "otp": has("otp", "one-time", "رمز التحقق", "verification code"),
        "emirates_id": has("emirates id", "eid", "784", "الهوية"),
    }
    low = text.lower()
    urgency = [k for k in CFG["urgency_keywords"]["en"] if k in low] + [k for k in CFG["urgency_keywords"]["ar"] if k in text]
    mentioned = [b["id"] for b in BRANDS if any(t.lower() in (text + " " + title).lower() for t in b["text_keywords"])]
    arabic_ratio = len(re.findall(r"[؀-ۿ]", text)) / max(1, len(text))
    sig = "|".join(sorted(f"{f.get('type')}:{f.get('name')}" for f in forms))
    return {"asks_for": [k for k, v in asks.items() if v], "urgency": urgency[:8],
            "brands_mentioned": mentioned, "phones": sorted(set(PHONE_RE.findall(text)))[:10],
            "language": "ar" if arabic_ratio > 0.3 else ("mixed" if arabic_ratio > 0.05 else "en"),
            "form_signature": sig, "title": title[:200], "text_excerpt": text[:3000]}
```

### 7.10 `app/pipeline/visual.py`
```python
import base64, io
from pathlib import Path
from PIL import Image
import imagehash
from ..config import VISUAL_ENABLED, DATA_DIR
_model, _refs = None, {}

def _load():
    global _model
    if _model is None:
        from sentence_transformers import SentenceTransformer
        _model = SentenceTransformer("clip-ViT-B-32")
        for p in (DATA_DIR / "references").glob("*.png"):       # e.g. adcb.png, tamm.png
            _refs[p.stem] = _model.encode(Image.open(p).convert("RGB"), normalize_embeddings=True)
    return _model

def compare(png_b64: str) -> dict:
    img = Image.open(io.BytesIO(base64.b64decode(png_b64))).convert("RGB")
    out = {"phash": str(imagehash.phash(img)), "best_brand": None, "similarity": 0.0}
    if not VISUAL_ENABLED: return out
    m = _load()
    if not _refs: return out
    e = m.encode(img, normalize_embeddings=True)
    sims = {k: float((e * v).sum()) for k, v in _refs.items()}
    k = max(sims, key=sims.get)
    out.update(best_brand=k, similarity=round(sims[k], 3), all=sims)
    return out
```
> Reference screenshots: run `python -m app.capture_refs` once (it calls the sandbox on each brand's official login/landing page and saves `data/references/<brand_id>.png`). Use the **same mobile viewport** as the sandbox.

### 7.11 `app/pipeline/llm.py` — local SLM (Arabic + English)
```python
import json, httpx
from ..config import LLM_ENABLED, OLLAMA_URL, OLLAMA_MODEL

PROMPT = """You are a fraud analyst for Abu Dhabi Police. Analyse this web page captured in a sandbox.
URL: {url}
Domain is an official brand domain: {official}
Page title: {title}
Form fields requested: {asks}
Visible text (may be Arabic or English):
\"\"\"{text}\"\"\"

Return ONLY JSON:
{{"is_scam": true|false, "confidence": 0..1, "impersonated_brand": string|null,
  "scam_type": "phishing|fake_payment|fake_support|investment|shopping|none",
  "intent": "one short sentence",
  "summary_en": "2 sentences for an investigator",
  "summary_ar": "جملتان للمحقق بالعربية"}}"""

async def analyze(url, official, content):
    if not LLM_ENABLED: return None
    body = {"model": OLLAMA_MODEL, "stream": False, "format": "json", "think": False,
            "options": {"temperature": 0.1},
            "messages": [{"role": "user", "content": PROMPT.format(url=url, official=official,
                          title=content["title"], asks=content["asks_for"], text=content["text_excerpt"][:2500])}]}
    try:
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.post(f"{OLLAMA_URL}/api/chat", json=body)
        return json.loads(r.json()["message"]["content"])
    except Exception as e:
        return {"error": str(e)[:200]}
```
(If your Ollama version rejects `think`, remove it. If the SLM is too slow on the demo laptop, use a smaller model or pre-scan demo URLs.)

### 7.12 `app/pipeline/ml_model.py` (optional but improves accuracy)
```python
import joblib
from pathlib import Path
from ..config import DATA_DIR
NUM = ["url_len","host_len","digits","hyphens","entropy","subdomain_depth","path_len","query_len"]
BOOL = ["is_ip","punycode","has_at","suspicious_tld","free_host","shortener"]
_m = None
def vec(f): return [f[k] for k in NUM] + [int(f[k]) for k in BOOL] + [len(f["keywords"]), int(bool(f["brand_imitation"]))]
def predict(f):
    global _m
    p = DATA_DIR / "url_model.joblib"
    if _m is None and p.exists(): _m = joblib.load(p)
    return float(_m.predict_proba([vec(f)])[0][1]) if _m else None
```
`train_url_model.py`: load a public labelled URL dataset (e.g. Hugging Face `pirocheto/phishing-url` — **check its column names first**), run `url_features.extract` on each URL, train `sklearn.ensemble.HistGradientBoostingClassifier`, print precision/recall on a held-out split, save `data/url_model.joblib`. If short on time, skip; scoring still works.

### 7.13 `app/pipeline/scoring.py` — explainable noisy-OR
Each triggered signal has a weight w ∈ (0,1). **Score = 100 × (1 − ∏(1 − wᵢ))**. Each signal carries an English + Arabic reason. Allowlisted official domains are forced to Safe.

```python
def score(f, intel, sb, content, visual, llm, ml_p):
    S = []   # (id, weight, reason_en, reason_ar)
    add = lambda i, w, en, ar: S.append({"id": i, "weight": round(w, 3), "reason_en": en, "reason_ar": ar})

    if f["allowlisted"]:
        return 2, "safe", [{"id": "official_domain", "weight": 0, "reason_en": f"Official domain ({f['official_brand'] or f['domain']})",
                            "reason_ar": "نطاق رسمي معتمد"}]
    bi = f["brand_imitation"]
    if bi:
        w = {"homoglyph": .65, "typosquat": .6, "keyword": .5}[bi["kind"]]
        add("brand_imitation", w, f"Domain imitates {bi['brand'].upper()} ({bi['kind']}: {bi['detail']})",
            f"النطاق ينتحل علامة {bi['brand'].upper()}")
    if f["punycode"]: add("punycode", .35, "Uses look-alike Unicode characters (punycode)", "يستخدم أحرفاً مشابهة (Punycode)")
    if f["is_ip"]: add("ip_host", .35, "Link points to a raw IP address", "الرابط يشير إلى عنوان IP مباشر")
    if f["suspicious_tld"]: add("tld", .15, f"High-abuse domain ending .{f['tld']}", "امتداد نطاق شائع الاستخدام في الاحتيال")
    if f["free_host"]: add("free_host", .15, "Hosted on a free website builder", "مستضاف على منصة مجانية")

    age = (intel.get("whois") or {}).get("age_days")
    if age is not None and age < 7:   add("new_domain", .5, f"Domain registered {age} days ago", f"تم تسجيل النطاق قبل {age} أيام")
    elif age is not None and age < 30: add("young_domain", .3, f"Domain registered {age} days ago", f"تم تسجيل النطاق قبل {age} يوماً")
    ca = (intel.get("tls") or {}).get("cert_age_days")
    if ca is not None and ca < 3: add("new_cert", .2, "TLS certificate issued in the last 3 days", "شهادة أمان صادرة خلال آخر 3 أيام")

    chain = sb.get("redirect_chain") or []
    hosts = {c.split("/")[2] for c in chain if "://" in c}
    if f["shortener"] or len(chain) >= 3 or len(hosts) >= 3:
        add("redirects", .2, f"Hidden behind {len(chain)-1} redirect(s) / short link", "مخفي خلف روابط تحويل أو رابط مختصر")
    bv, fu = sb.get("bot_view") or {}, sb.get("final_url") or ""
    if bv.get("final_url") and fu and bv["final_url"].split("/")[2] != fu.split("/")[2]:
        add("cloaking", .45, "Shows different content to crawlers vs phones (cloaking)", "يعرض محتوى مختلفاً لأدوات الفحص (إخفاء)")

    asks = content.get("asks_for", [])
    if "card" in asks or "cvv" in asks: add("asks_card", .55, "Page asks for card number / CVV", "الصفحة تطلب رقم البطاقة")
    if "otp" in asks: add("asks_otp", .45, "Page asks for a one-time password (OTP)", "الصفحة تطلب رمز التحقق OTP")
    if "emirates_id" in asks: add("asks_eid", .4, "Page asks for Emirates ID", "الصفحة تطلب رقم الهوية الإماراتية")
    if "password" in asks: add("asks_password", .3, "Page has a login/password form", "الصفحة تحتوي نموذج تسجيل دخول")
    if content.get("brands_mentioned"):
        add("brand_text", .35, f"Page claims to be {', '.join(content['brands_mentioned']).upper()} on a non-official domain",
            "الصفحة تدّعي أنها جهة رسمية على نطاق غير رسمي")
    if content.get("urgency"): add("urgency", .15, "Pressure language: " + ", ".join(content["urgency"][:3]), "لغة استعجال وتهديد")

    if visual and visual.get("similarity", 0) >= .88:
        add("visual_clone", .7, f"{int(visual['similarity']*100)}% visually similar to the real {visual['best_brand'].upper()} page",
            f"مطابقة بصرية {int(visual['similarity']*100)}% مع الصفحة الرسمية")
    if llm and llm.get("is_scam"):
        c = float(llm.get("confidence", .5))
        add("llm", .6 * c, f"AI analyst: {llm.get('intent','likely scam')}", "المحلل الذكي: " + (llm.get("summary_ar") or "احتيال محتمل"))
    if ml_p is not None and ml_p > .5:
        add("ml_url", .5 * ml_p, f"URL pattern model: {int(ml_p*100)}% phishing-like", f"نموذج الروابط: {int(ml_p*100)}% احتمال تصيد")

    prod = 1.0
    for s in S: prod *= (1 - s["weight"])
    sc = round(100 * (1 - prod))
    verdict = "scam" if sc >= 70 else "suspicious" if sc >= 40 else "safe"
    S.sort(key=lambda s: -s["weight"])
    return sc, verdict, S
```
**Tune thresholds on `data/eval/labeled.csv` with `eval.py`** (section 9). If false positives appear on legit sites, lower `brand_text`/`urgency`, or add the domain family to the allowlist.

### 7.14 `app/pipeline/__init__.py` — `run_scan()`
```python
import asyncio, base64, hashlib, json
from ..config import EVIDENCE_DIR, DEMO_MODE
from .. import db
from . import url_features, network_intel, sandbox_client, content as content_mod, visual, llm, ml_model, scoring

async def run_scan(url: str, source="manual", agent=False, fast=False) -> dict:
    f = url_features.extract(url)
    if DEMO_MODE and (cached := db.latest_scan_for_domain(f["domain"])): return cached
    sid, started = db.new_id("scan"), db.now()
    if fast or f["allowlisted"]:
        intel, sb = ({} if f["allowlisted"] else await network_intel.gather(f["host"], f["domain"])), {}
    else:
        intel, sb = await asyncio.gather(network_intel.gather(f["host"], f["domain"]),
                                         sandbox_client.visit(f["url"], agent=agent))
        # re-run features on final URL if redirected to another domain
        if sb.get("final_url") and url_features.extract(sb["final_url"])["domain"] != f["domain"]:
            f2 = url_features.extract(sb["final_url"]); f2["redirected_from"] = f["url"]; f = f2
            intel = await network_intel.gather(f["host"], f["domain"])
    steps = sb.get("steps", [])
    c = content_mod.analyze(steps, bool(f["official_brand"]))
    v = await asyncio.to_thread(visual.compare, steps[0]["png_b64"]) if steps else None
    l = await llm.analyze(f["url"], bool(f["official_brand"]), c) if steps and not f["allowlisted"] else None
    mp = ml_model.predict(f)
    sc, verdict, reasons = scoring.score(f, intel, sb, c, v, l, mp)

    # evidence on disk + SHA-256 manifest (chain of custody)
    ev = EVIDENCE_DIR / sid; ev.mkdir(parents=True, exist_ok=True); manifest = []
    def put(name, data: bytes):
        (ev / name).write_bytes(data); manifest.append({"file": name, "sha256": hashlib.sha256(data).hexdigest()})
    shots = []
    for i, s in enumerate(steps):
        put(f"screenshot_{i}.png", base64.b64decode(s["png_b64"]))
        shots.append({"index": i, "label": s["label"], "url": s["url"], "path": f"/api/scans/{sid}/screenshot/{i}"})
    if sb.get("html"): put("page.html", sb["html"].encode())
    put("network.json", json.dumps(sb.get("network", []), indent=1).encode())
    put("intel.json", json.dumps(intel, indent=1, default=str).encode())
    brand_id = (f["brand_imitation"] or {}).get("brand") or (v or {}).get("best_brand") if sc >= 40 else f["official_brand"]
    result = {
        "id": sid, "url": url, "final_url": sb.get("final_url") or f["url"], "domain": f["domain"], "source": source,
        "score": sc, "verdict": verdict, "brand": {"id": brand_id} if brand_id else None,
        "reasons": reasons, "features": f, "intel": intel,
        "redirect_chain": sb.get("redirect_chain", []), "cloaking": sb.get("bot_view"),
        "content": {k: v_ for k, v_ in c.items() if k != "text_excerpt"},
        "visual": {k: v_ for k, v_ in (v or {}).items() if k != "all"}, "llm": l, "ml_probability": mp,
        "screenshots": shots, "evidence_manifest": manifest, "sandbox_error": sb.get("error"),
        "created_at": started, "completed_at": db.now(),
    }
    (ev / "result.json").write_text(json.dumps(result, indent=1, default=str), encoding="utf-8")
    db.save_scan(result)
    return result
```

---

## 8. Discovery (Early Detection & Coverage)

### 8.1 `discovery/ct_monitor.py` — Certificate Transparency via crt.sh
```python
import datetime as dt, httpx
from ..pipeline.url_features import BRANDS
async def poll(hours=48):
    found, cutoff = [], dt.datetime.utcnow() - dt.timedelta(hours=hours)
    async with httpx.AsyncClient(timeout=40) as c:
        for b in BRANDS:
            for kw in b["keywords"]:
                try:
                    rows = (await c.get("https://crt.sh/", params={"q": f"%{kw}%", "output": "json", "exclude": "expired"})).json()
                except Exception: continue          # crt.sh is often slow; just skip
                for r in rows:
                    ts = r.get("entry_timestamp", "")[:19]
                    if not ts or dt.datetime.fromisoformat(ts) < cutoff: continue
                    for name in r.get("name_value", "").splitlines():
                        found.append({"source": "ct", "kind": "domain", "item": name.lstrip("*.").lower(),
                                      "brand": b["id"], "detected_at": ts + "Z"})
    return found
```
Filter out official domains with `url_features.is_allowlisted` before queuing.
*(Production upgrade: stream CT logs in real time with certstream.)*

### 8.2 `discovery/lookalikes.py` — look-alike generator (dnstwist)
```python
import asyncio, dnstwist
from ..pipeline.url_features import BRANDS
def _run(domain): return dnstwist.run(domain=domain, registered=True, format="null")
async def poll():
    out = []
    for b in BRANDS:
        for od in b["official_domains"]:
            if od.endswith(".test"): continue
            try: rows = await asyncio.to_thread(_run, od)
            except Exception: continue
            for r in rows:
                if r.get("domain") != od and r.get("dns_a"):
                    out.append({"source": "lookalike", "kind": "domain", "item": r["domain"], "brand": b["id"],
                                "meta": {"fuzzer": r.get("fuzzer")}})
    return out
```
Plus custom UAE variants: `{kw}-uae`, `{kw}-pay`, `{kw}-secure`, `{kw}-fines`, `{kw}ae`, `my{kw}`, Arabic transliterations (`masraf`, `bank-abudhabi`). Check existence with a DNS A lookup.

### 8.3 `discovery/search.py` — Search results & ads (SerpAPI)
```python
import httpx
from ..config import SERPAPI_KEY
from ..pipeline.url_features import extract
QUERIES = ["ADCB login", "TAMM traffic fine payment", "UAE PASS login", "Abu Dhabi Police fines pay",
           "Salik recharge", "Emirates Post parcel delivery fee", "دفع مخالفات شرطة أبوظبي", "تسجيل دخول بنك أبوظبي التجاري"]
async def poll():
    if not SERPAPI_KEY: return []
    out = []
    async with httpx.AsyncClient(timeout=20) as c:
        for q in QUERIES:
            j = (await c.get("https://serpapi.com/search.json",
                 params={"q": q, "gl": "ae", "hl": "en", "api_key": SERPAPI_KEY})).json()
            for kind, items in (("ad", j.get("ads", [])), ("organic", j.get("organic_results", []))):
                for it in items:
                    link = it.get("link") or it.get("tracking_link")
                    if link and not extract(link)["allowlisted"]:
                        out.append({"source": f"search_{kind}", "kind": "url", "item": link, "brand": None,
                                    "meta": {"query": q, "title": it.get("title")}})
    return out
```

### 8.4 `discovery/maps.py` — fake listings / fake helpline numbers (Google Places API, New)
```python
import httpx, re
from ..config import GOOGLE_PLACES_KEY
from ..pipeline.url_features import BRANDS, extract
FIELDS = "places.id,places.displayName,places.formattedAddress,places.internationalPhoneNumber,places.nationalPhoneNumber,places.websiteUri,places.googleMapsUri"
digits = lambda s: re.sub(r"\D", "", s or "")[-9:]

async def poll():
    if not GOOGLE_PLACES_KEY: return []
    out = []
    async with httpx.AsyncClient(timeout=20) as c:
        for b in BRANDS:
            if b["id"] == "saqrbank": continue
            for q in (f"{b['name']['en']} customer service", f"{b['name']['en']} branch Abu Dhabi"):
                r = await c.post("https://places.googleapis.com/v1/places:searchText",
                    headers={"X-Goog-Api-Key": GOOGLE_PLACES_KEY, "X-Goog-FieldMask": FIELDS},
                    json={"textQuery": q, "regionCode": "AE", "languageCode": "en"})
                for p in r.json().get("places", []):
                    phone, site = p.get("internationalPhoneNumber"), p.get("websiteUri")
                    flags = []
                    if site and not extract(site)["allowlisted"]: flags.append("website_not_official")
                    official = {digits(x) for x in b["phones"]}
                    if phone and official and digits(phone) not in official: flags.append("phone_not_official")
                    if phone and re.search(r"(\+971|0)\s?5\d", phone) and official: flags.append("mobile_number_for_bank")
                    if flags:
                        out.append({"source": "maps", "kind": "listing", "item": p["id"], "brand": b["id"],
                                    "meta": {"name": p["displayName"]["text"], "phone": phone, "website": site,
                                             "address": p.get("formattedAddress"), "maps_url": p.get("googleMapsUri"), "flags": flags}})
    return out
```
Maps listings get a **listing risk score** (website not official +40, phone not official +40, mobile number for a bank +20, claims brand name +20, capped 100) and, if they have a website, that website is auto-scanned.

### 8.5 `discovery/loop.py`
Every `DISCOVERY_INTERVAL_MIN`: run all pollers → insert new items into `discoveries` (UNIQUE source+item ignores repeats) with `detected_at = now` → queue a scan for each new domain/URL (`asyncio.Semaphore(SCAN_CONCURRENCY)`), saving `scan_id` back on the discovery row. Start it in FastAPI `lifespan` when `DISCOVERY_ENABLED`. Expose `POST /api/discovery/run` to trigger it manually during the demo.

---

## 9. Graph, evidence, CLI and evaluation

### 9.1 `graph.py` — fraud network
- Use scans with `score >= 40`. Nodes: `domain:<d>`, and indicator nodes `ip:`, `asn:`, `phone:`, `form:<sha1(form_signature)>`, `phash:<phash[:12]>`, `cert:<serial>`, `ns:<nameserver>`.
- Edges: domain → each indicator.
- **Drop indicator nodes with degree > 25** (CDN IPs, big registrars) so clusters stay meaningful.
- Clusters = connected components that contain ≥ 2 domains; cluster id = `c_<sha1 of sorted domains>[:8]`.
- `GET /api/graph` returns `{nodes:[{id,type,label,score?}], edges:[{source,target,type}], clusters:[{id,domains,shared_indicators,max_score,brand}]}`.

### 9.2 `evidence.py` — police-ready output
- `build_scan_pdf(scan)` and `build_case_pdf(case)` via Jinja2 `templates/report.html` → WeasyPrint. Contents: case/scan id, UTC timestamps, verdict + score, bilingual reasons, AI summary (EN + AR, `dir="rtl"` block), screenshots (agent steps in order), redirect chain, WHOIS/RDAP (created, registrar, abuse email), hosting (IP, ASN, country), TLS (issuer, not_before), DNS, Maps listing data if any, **evidence manifest table with SHA-256 of every file**, and the footer *"Generated automatically by ScamShield AI in an isolated sandbox. No real personal data was submitted."*
- `build_json(case)`: same data, machine-readable (for takedown pipelines).
- `takedown_draft(scan)`: plain-text abuse report addressed to the registrar `abuse_email` and the hosting org: URL, why it is fraudulent, evidence hashes, timestamps.

### 9.3 `cli.py` — hidden test set (Accuracy 30%)
```bash
# input: CSV with a 'url' column (any other columns are ignored)
python -m app.cli score input.csv predictions.csv              # full pipeline (sandbox)
python -m app.cli score input.csv predictions.csv --fast       # URL + network intel only, very fast
```
Output columns: `url, verdict, score, is_scam (1/0), top_reasons`. Use `asyncio.Semaphore(SCAN_CONCURRENCY)`, timeout per URL 60 s, **never crash**: on error, fall back to the fast score. Same thing available over HTTP: `POST /api/scan/batch`.

### 9.4 `eval.py` — our own numbers for the deck
- `data/eval/labeled.csv` columns `url,label` (1 = scam, 0 = legit).
  - Scams: fresh URLs from public feeds such as **OpenPhish community feed** / PhishTank (live ones die fast, so collect and scan them tonight).
  - Legit: all `official_domains` + popular UAE sites + Tranco top domains (gives the false-positive check).
- `python -m app.eval data/eval/labeled.csv` → precision, recall, F1, **false-positive rate on official UAE domains** (target 0), confusion matrix. Put the numbers on a slide and note the dataset size honestly.

---

## 10. API contract (backend ⇄ frontend)

All routes under `/api`, JSON, header `X-API-Key: <API_KEY>` (skip for `/health`). Enable CORS for `CORS_ORIGINS`.

| Method | Path | Purpose | Screen |
|---|---|---|---|
| GET | `/health` | `{backend, db, sandbox, llm, visual, discovery}` each `ok/down` | header status dot |
| POST | `/api/scan` | body `{url, agent?:bool, fast?:bool}` → **ScanResult** | Scan |
| POST | `/api/scan/batch` | multipart `file` (CSV) → `{job_id}` | Scan (batch) |
| GET | `/api/jobs/{id}` | `{status, total, done}` | Scan (batch) |
| GET | `/api/jobs/{id}/csv` | predictions CSV | Scan (batch) |
| GET | `/api/scans?limit=&min_score=` | recent ScanResult summaries | Discovery / Reports |
| GET | `/api/scans/{id}` | full ScanResult | Scan / Reports |
| GET | `/api/scans/{id}/screenshot/{n}` | PNG | Scan / Reports |
| GET | `/api/scans/{id}/report.pdf` · `report.json` · `takedown.txt` | evidence exports | Scan / Reports |
| GET | `/api/discovery?source=&min_score=&limit=` | **DiscoveryItem[]** | Discovery |
| POST | `/api/discovery/run` | trigger all pollers now | Discovery |
| GET | `/api/stats` | `{found_today, high_risk, brands_targeted, scans_total, by_source}` | Discovery header |
| GET | `/api/graph` | `{nodes, edges, clusters}` | Network |
| POST | `/api/cases` | `{title, scan_ids[] , cluster_id?}` → Case | Network / Reports |
| GET | `/api/cases` · `/api/cases/{id}` | Case list / detail | Reports |
| PATCH | `/api/cases/{id}` | `{status: open|sent_for_takedown|closed}` | Reports |
| GET | `/api/cases/{id}/report.pdf` · `report.json` | case evidence pack | Reports |

**ScanResult (what the Scan screen needs)**
```json
{
  "id": "scan_ab12cd34ef", "url": "https://bit.ly/xyz", "final_url": "https://saqrbank-secure-login.test/",
  "domain": "saqrbank-secure-login.test", "score": 94, "verdict": "scam",
  "brand": {"id": "saqrbank"},
  "reasons": [{"id": "visual_clone", "weight": 0.7, "reason_en": "93% visually similar to the real SAQRBANK page", "reason_ar": "..."}],
  "redirect_chain": ["https://bit.ly/xyz", "https://saqrbank-secure-login.test/"],
  "intel": {"whois": {"created": "...", "age_days": 2, "registrar": "...", "abuse_email": "..."},
            "hosting": {"ip": "...", "country": "...", "asn": 0, "org": "..."},
            "tls": {"issuer": "...", "not_before": "...", "cert_age_days": 1}, "dns": {"a": [], "ns": []}},
  "content": {"asks_for": ["card","otp"], "language": "ar", "urgency": ["مخالفة"], "phones": []},
  "visual": {"best_brand": "saqrbank", "similarity": 0.93},
  "llm": {"summary_en": "...", "summary_ar": "...", "scam_type": "fake_payment", "confidence": 0.9},
  "screenshots": [{"index": 0, "label": "landing", "path": "/api/scans/scan_ab12cd34ef/screenshot/0"}],
  "evidence_manifest": [{"file": "screenshot_0.png", "sha256": "..."}],
  "created_at": "2026-11-25T01:12:09+00:00", "completed_at": "2026-11-25T01:12:31+00:00"
}
```
**DiscoveryItem**
```json
{"id": "disc_...", "source": "ct|lookalike|search_ad|search_organic|maps", "kind": "domain|url|listing",
 "item": "tamm-fines-pay.net", "brand": "tamm", "detected_at": "2026-11-25T00:41:00Z",
 "scan_id": "scan_...", "score": 91, "verdict": "scam", "meta": {}}
```
For the side-by-side "Real brand page" image, serve `GET /api/references/{brand_id}.png` from `data/references/`.

---

## 11. Front-end integration (Claude Design → working app)

The UI already exists in Claude Design (`ScamShield Dashboard.dc.html` + `support.js`). **Keep the design; only connect it to data.**

1. Export/import the project into `frontend/` (use the Claude Design MCP: project `3af79c51-4682-41a9-812b-b079e3676d56`).
2. Read both files fully. List every place that uses **mock/sample data** (arrays of domains, scores, listings, graph nodes, reports) and every button/handler (Scan, Upload CSV, Download evidence pack, Add to case, Generate cluster report, PDF/JSON export, filters, language toggle).
3. Create `frontend/api.js`:
```js
const API = {
  base: window.SCAMSHIELD_API || "http://localhost:8000",
  key: window.SCAMSHIELD_KEY || "change-me",
  async req(path, opts = {}) {
    const r = await fetch(this.base + path, { ...opts,
      headers: { "X-API-Key": this.key, ...(opts.body && !(opts.body instanceof FormData) ? {"Content-Type": "application/json"} : {}), ...(opts.headers||{}) } });
    if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
    return r.headers.get("content-type")?.includes("json") ? r.json() : r;
  },
  scan: (url, agent = false) => API.req("/api/scan", { method: "POST", body: JSON.stringify({ url, agent }) }),
  batch: (file) => { const f = new FormData(); f.append("file", file); return API.req("/api/scan/batch", { method: "POST", body: f }); },
  job: (id) => API.req(`/api/jobs/${id}`),
  scans: (q = "") => API.req(`/api/scans${q}`),
  scanById: (id) => API.req(`/api/scans/${id}`),
  discovery: (q = "") => API.req(`/api/discovery${q}`),
  runDiscovery: () => API.req("/api/discovery/run", { method: "POST" }),
  stats: () => API.req("/api/stats"),
  graph: () => API.req("/api/graph"),
  cases: () => API.req("/api/cases"),
  createCase: (body) => API.req("/api/cases", { method: "POST", body: JSON.stringify(body) }),
  file: (path) => `${API.base}${path}${path.includes("?") ? "&" : "?"}key=${API.key}`,   // backend also accepts ?key= for <img>/downloads
  health: () => fetch(API.base + "/health").then(r => r.json()),
};
window.API = API;
```
4. Replace mock data with API calls, screen by screen:
   - **Scan:** input → `API.scan(url)`; show a calm loading state ("Opening in sandbox… collecting evidence…", ~10–30 s); render score ring (verdict colour), `reasons` (use `reason_ar` in Arabic mode), screenshots via `API.file(screenshot.path)`, real brand image `/api/references/{brand.id}.png`, facts row from `intel` (age, country, IP, registrar, created_at). "Download evidence pack" → `API.file(/api/scans/{id}/report.pdf)`. CSV upload → `API.batch` + poll `API.job` + download link.
   - **Discovery:** `API.stats()` for the stat row, `API.discovery()` for the table, tabs map to `?source=`/`?min_score=70`; "x min ago" from `detected_at`; row click → open that scan's result. Poll every 30 s.
   - **Network:** `API.graph()`; keep the design's visual style (small circles coloured by score, thin grey lines). If the design uses static SVG, render with a light force layout (e.g. `d3-force` from a CDN). Cluster click → side panel from `clusters[]`; "Generate cluster report" → `API.createCase({title, scan_ids, cluster_id})` then open its PDF.
   - **Reports:** `API.cases()` list; detail shows AI summary EN/AR, evidence list, PDF/JSON buttons.
   - **Header:** health dot from `API.health()`.
5. Config at the top of the HTML: `<script>window.SCAMSHIELD_API="https://api.your-domain";window.SCAMSHIELD_KEY="...";</script>` then `<script src="api.js"></script>` before `support.js`.
6. Keep a **fallback**: if the API is unreachable, show a small banner "Offline — showing saved demo data" and use the existing mock data. The demo never shows a blank screen.
7. Keep RTL/Arabic toggle working with the new data (`reason_ar`, `summary_ar`).

---

## 12. Demo safety & reliability

**Fictional test brand, local only.** For the live scan, use the fictional brand **"Saqr Bank"** (in `brands.yaml`):
- `demo-sites/saqrbank.test/` = the "official" Saqr Bank page (also captured as `data/references/saqrbank.png`).
- `demo-sites/saqrbank-secure-login.test/` = a look-alike with an Arabic/English "account suspended" message, a login form, then `step2.html` asking for card + OTP.
- Both pages carry a visible "ScamShield TEST PAGE" footer and `<meta name="robots" content="noindex">`, use **no real brand names or logos**, and are served **only inside the docker network** (never deployed publicly).
- In the demo you can also scan a short link that redirects to it (add a tiny redirect route in `demo-sites/nginx.conf`, e.g. `saqrbank.test/r/abc` → look-alike) to show redirect handling. Set `AGENT_ENABLED=true` to show the agent walking through steps with canary data.

**Real-world examples:** before the pitch, scan a few **currently live** UAE-targeting phishing URLs from public feeds and keep their saved results (`DEMO_MODE=true` serves cached results instantly). Never submit data to live sites: keep `AGENT_ENABLED=false` for anything outside `demo-sites`.

**Reliability checklist**
- [ ] `python -m app.seed_demo` fills Discovery, Network (≥ 2 clusters) and Reports with real saved scans.
- [ ] `/health` all green 10 minutes before the slot; open every screen once to warm models.
- [ ] Full stack also runs on the demo laptop (`docker compose up`), plus a phone hotspot.
- [ ] 1-minute demo video recorded (needed for submission anyway).
- [ ] Rehearse to 3:00 with a timer.

---

## 13. Deployment

- **Backend + sandbox + ollama:** one VPS (4 vCPU / 8 GB RAM recommended), Ubuntu, Docker. `git clone`, `cp .env.example .env`, `docker compose --profile llm up -d --build`, pull the model. Put **Caddy** in front for HTTPS (`api.your-domain → backend:8000`). Do **not** expose `sandbox`, `ollama` or `demo-sites` ports publicly.
- **Frontend:** static files → Vercel (or the `frontend` nginx container). Set `window.SCAMSHIELD_API` to the HTTPS API URL and add the Vercel domain to `CORS_ORIGINS`.
- Vercel cannot run the sandbox, the discovery loop or the models (no Docker, short-lived functions), which is why the backend lives on the VPS.

---

## 14. Build order (tonight) and acceptance tests

| Phase | Target time | Build | Done when |
|---|---|---|---|
| 1 | 20:45–22:00 | Repo, compose, sandbox service | `curl -XPOST :9000/visit -d '{"url":"https://example.com"}'` returns screenshot + redirect chain |
| 2 | 22:00–23:30 | `url_features`, `network_intel`, `content`, `scoring`, `run_scan`, `/api/scan`, evidence folder | Scanning `adcb.com` → **safe**; scanning the Saqr Bank look-alike → **scam ≥ 70** with ≥ 4 reasons; evidence files + manifest on disk |
| 3 | 23:30–00:30 | Frontend wired: Scan screen + PDF export | Scan from the UI shows real result; PDF downloads with screenshots + hashes |
| 4 | 00:30–01:30 | CLI batch + `/api/scan/batch` + `eval.py` + labelled set | `predictions.csv` produced; precision/recall printed |
| 5 | 01:30–03:00 | Discovery: CT + look-alikes + Maps (+ Search if key) + loop + Discovery screen | New items appear with `detected_at` and auto-scan scores |
| 6 | 03:00–04:00 | `visual.py` (refs captured) + `llm.py` | Reasons include visual similarity %; AI summary in EN + AR |
| 7 | 04:00–05:00 | `graph.py` + Network screen + cases + case PDF | ≥ 1 cluster with shared indicators; cluster report PDF |
| 8 | 05:00–07:15 | Seed demo, deploy, README, deck, 1-min video | Section 12 checklist all ticked |
| 9 | **07:15–07:45** | **Submit on Podium+** (repo link on `master`, PPT, video) | Confirmation received. **Do not wait until 07:59** |

**If behind schedule, cut in this order:** search monitoring → agent walk-through → network graph → LLM (keep template explanations) → visual similarity. **Never cut:** scan + allowlist + reasons + evidence export + batch CLI.

**Repo hygiene before submitting:** no unused files, no empty tests, no commented-out code, no `.env` or API keys committed (add `.gitignore`).

---

## 15. Submission README outline (`README.md`)

1. **Problem** — fraudulent links/websites targeting UAE residents spread through search results, ads and Maps faster than victims report them.
2. **Solution** — ScamShield AI: Discover → Detect → Connect → Explain → Report. One-line description of each part.
3. **How it detects** — signals table (domain/brand imitation, domain age, TLS, redirects/shorteners, cloaking, forms asking for card/OTP/Emirates ID, visual similarity, local SLM analysis, URL model) and the noisy-OR score.
4. **Early detection & coverage** — CT logs, look-alike generation, search ads/results, Google Maps listings.
5. **Evidence & actionability** — evidence pack contents, SHA-256 manifest, PDF/JSON, takedown draft.
6. **UAE relevance** — UAE brand registry, Arabic/English analysis, Gulf-dialect-capable local model, data stays on-premise.
7. **Tech stack / APIs / data** — FastAPI, Playwright, Docker, SQLite, CLIP, Ollama (model name), crt.sh, dnstwist, RDAP, ipwho.is, Google Places API, SerpAPI, datasets used.
8. **Results** — our precision/recall/F1/FPR on our labelled set (state its size and source).
9. **How to build and run** — `.env`, `docker compose --profile llm up -d --build`, model pull, `python -m app.capture_refs`, `python -m app.seed_demo`, open `http://localhost:8080`; batch: `python -m app.cli score input.csv out.csv`.
10. **Security & ethics** — links opened only in an isolated sandbox; agent uses fake canary data only and runs only under authorisation; no real personal data stored.
11. **Limitations (be honest)** — shared sandbox container (prod: per-scan microVM + UAE residential proxy), Maps/Search depend on API quotas, crt.sh polling rather than real-time streaming, small evaluation set, SLM speed on CPU.
12. **Pilot path with Abu Dhabi Police** — on-premise deployment, feed into the takedown team, WhatsApp/Telegram citizen bot on the same `/scan` API, weekly brand list updates with UAE banks.
13. **Team** — names and roles.
