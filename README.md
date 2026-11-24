# ScamShield AI

**Abu Dhabi Police × 42 Abu Dhabi hackathon.** ScamShield finds fraudulent websites and fake Google Maps listings that target UAE residents. It checks each one in an isolated browser, explains the risk in English and Arabic, links sites run by the same operator, and packages police-ready evidence for takedown.

## 1. Problem

Scam links (fake bank logins, fake traffic-fine payments, fake helplines) spread through SMS, search ads and Maps listings faster than victims report them. Investigators need to check suspicious links safely, find new ones before anyone reports them, see which sites belong to the same operator, and send takedown requests with evidence that holds up.

## 2. Solution: Discover → Detect → Connect → Explain → Report

| Step | What it does |
|---|---|
| **Discover** | Watches Certificate Transparency logs, generates and DNS-checks look-alike domains, monitors search results/ads and Google Maps listings for UAE brands. New finds are scanned automatically. |
| **Detect** | Opens each link in a sandboxed mobile browser (never on the investigator's machine) and scores it from URL, registration, hosting, TLS, redirect, page content, visual-similarity, URL-model and local-LLM signals. |
| **Connect** | Builds a fraud network: domains linked by shared IP, phone number, form template, page look, TLS certificate or name server. |
| **Explain** | Every score comes with plain reasons in English and Arabic. |
| **Report** | Evidence folder per scan with a SHA-256 manifest, PDF and JSON exports, and a takedown email draft addressed to the registrar's abuse contact. |

## 3. How it detects

Each signal that fires has a weight *w*. The score is a noisy-OR: **score = 100 × (1 − ∏(1 − wᵢ))**. Scam ≥ 70, Suspicious ≥ 40. Official domains in the UAE brand registry are always Safe, unless a path or query redirects somewhere else (open-redirect abuse is followed and scored).

| Signal | Weight | Source |
|---|---|---|
| Domain imitates a brand (keyword / homoglyph / one-edit typosquat) | 0.50–0.65 | `url_features.py` |
| Visual clone of the official page (CLIP similarity ≥ 0.88) | 0.70 | `visual.py` |
| Page asks for card/CVV · OTP · Emirates ID · password | 0.55 · 0.45 · 0.40 · 0.30 | `content.py` |
| Domain registered < 7 days / < 30 days ago | 0.50 / 0.30 | RDAP |
| Local AI analyst says scam | 0.6 × confidence | `llm.py` (Ollama) |
| URL pattern model | 0.5 × p | `ml_model.py` |
| Different site shown to crawlers than to phones (cloaking) | 0.45 | sandbox bot view |
| Brand named on page *and* page asks for data or domain imitates it | 0.35 | `content.py` |
| Punycode / raw IP host | 0.35 | `url_features.py` |
| Cross-site redirects or short link | 0.20 | sandbox redirect chain |
| TLS certificate < 3 days old | 0.20 | TLS |
| High-abuse TLD · free site builder · pressure language | 0.15 each | `brands.yaml` |

## 4. Early detection and coverage

- **Certificate Transparency** (crt.sh): new certificates for names containing UAE brand keywords.
- **Look-alike generation**: dnstwist permutations plus UAE patterns (`{brand}-uae`, `-pay`, `-fines`, `-secure`, `my{brand}`…) across common TLDs, kept only if they resolve.
- **Search results and ads** (SerpAPI, Arabic and English queries such as "دفع مخالفات شرطة أبوظبي").
- **Google Maps listings** (Places API): flags listings using a brand name with a non-official website or phone number, and scores them.

The loop runs every `DISCOVERY_INTERVAL_MIN` minutes and can be triggered from the API (`POST /api/discovery/run`).

## 5. Evidence and actionability

Each scan writes `data/evidence/<scan_id>/`: screenshots (every step of the agent walk-through), page HTML, network log, intel JSON and `result.json`, with a SHA-256 manifest. The PDF report contains verdict and reasons (EN + AR), screenshots, redirect chain, RDAP/WHOIS (created, registrar, abuse contact), hosting (IP, ASN, country), TLS and the hash table. Cases group scans; case reports are available as PDF and JSON. `GET /api/scans/{id}/takedown.txt` drafts the abuse report.

## 6. UAE relevance

- Brand registry of UAE banks, government services, telecoms, airlines and couriers (`backend/app/brands.yaml`), plus global brands commonly phished in the UAE.
- Arabic and English everywhere: UI with full RTL, bilingual reasons, Arabic urgency keywords (مخالفة، غرامة، سيتم إيقاف…), Arabic form labels, AI summaries in both languages.
- Sandbox browses as an iPhone with `ar-AE` locale and Dubai time zone, the way victims see the page.
- Local model (Ollama), so no case data leaves the server.

## 7. Tech stack, APIs and data

FastAPI · Playwright/Chromium · SQLite · networkx · scikit-learn · CLIP (sentence-transformers) · Ollama (`qwen3:4b` by default) · React + Vite + TypeScript · Docker Compose.
External data: crt.sh, RDAP (rdap.org), ipwho.is, dnstwist, Google Places API (optional key), SerpAPI (optional key).
Datasets: Hugging Face `pirocheto/phishing-url` (URL model), OpenPhish community feed (evaluation).

## 8. Results

Labelled set `data/eval/labeled.csv`: **147 URLs**. There are 65 live phishing URLs sampled from the OpenPhish community feed on 24 Nov 2026 (one per domain), and 82 legitimate sites (all official UAE brand domains plus popular UAE and global sites). Most phishing in that feed targets global brands, not UAE ones, so this is a hard test for a UAE-focused detector.

| Mode | Threshold | Precision | Recall | F1 | False-positive rate | FPR on official UAE domains |
|---|---|---|---|---|---|---|
| Full pipeline (sandbox) | score ≥ 40 (default `is_scam`) | **1.00** | **0.77** | **0.87** | **0.00** | **0.00** |
| Full pipeline (sandbox) | score ≥ 70 ("scam" verdict) | 1.00 | 0.25 | 0.40 | 0.00 | 0.00 |
| Fast (URL + network intel, no sandbox) | score ≥ 40 | 1.00 | 0.72 | 0.84 | 0.00 | 0.00 |

Full pipeline run without the visual and LLM signals. Reproduce with `python -m app.eval data/eval/labeled.csv [--fast]`.
An earlier version had 5 false positives on legitimate UAE retail/news sites (Lulu, Sharaf DG, UAEU…). They came from
treating same-site redirects as cloaking and counting brand mentions on news pages. Both rules were fixed in general
terms (compare registered domains; brand mentions need a data-collecting form), not by allowlisting those sites.

URL model on its own (held-out test split of `pirocheto/phishing-url`, 3,772 URLs): accuracy 0.837, phishing F1 0.831.

The set is small, and live phishing pages die within hours (some were already offline when scanned). Treat these numbers as indicative.

## 9. How to build and run

**Docker (recommended)**
```bash
cp .env.example .env            # set API_KEY, optional SERPAPI_KEY / GOOGLE_PLACES_KEY
docker compose --profile llm up -d --build
docker compose exec ollama ollama pull qwen3:4b
docker compose exec backend python -m app.capture_refs     # official-page screenshots for visual similarity
docker compose exec backend python -m app.seed_demo        # demo data (real scans)
open http://localhost:8080
```

**Local development (no Docker)**
```bash
python3.12 -m venv .venv && .venv/bin/pip install -r backend/requirements.txt playwright==1.47.0
.venv/bin/python -m playwright install chromium
.venv/bin/python demo-sites/dev_server.py &                                       # fictional demo sites on :8090
(cd sandbox && SANDBOX_HOST_RULES="MAP *.test 127.0.0.1:8090" ../.venv/bin/uvicorn server:app --port 9000) &
(cd backend && DATA_DIR=../data AGENT_ENABLED=true ../.venv/bin/uvicorn app.main:app --port 8000) &
(cd frontend && npm install && npm run dev)                                        # http://localhost:5173
```

**Batch scoring (hidden test set)**
```bash
cd backend
python -m app.cli score input.csv predictions.csv          # full pipeline
python -m app.cli score input.csv predictions.csv --fast   # URL + network intel only
python -m app.eval ../data/eval/labeled.csv                # our own metrics
python -m app.train_url_model                              # retrain the URL model
```
Input needs a `url` column. Output columns: `url, verdict, score, is_scam, top_reasons`. The same batch runs from the UI ("Upload CSV") or `POST /api/scan/batch`.

## 10. Security and ethics

- Suspicious links are opened only in the sandbox container: read-only filesystem, no Linux capabilities, memory/CPU/PID limits, fresh browser context per scan. The sandbox refuses private and internal addresses (SSRF guard), except the local `.test` demo sites.
- The "fake victim" agent fills forms only with fixed canary values (card `4111 1111 1111 1111`, OTP `000000`…). It runs only when `AGENT_ENABLED=true` **and** the host matches `AGENT_ALLOWED_SUFFIXES` (default `.test`: the fictional demo sites). It never submits data to live sites.
- The live demo uses a fictional brand, "Saqr Bank", served only inside the Docker network, with a visible "ScamShield TEST PAGE" footer and `noindex`.
- No real personal data is collected or stored. The API is protected by an API key.

## 11. Limitations

- One long-running sandbox container with a fresh browser per scan. Production: one disposable container or Firecracker microVM per scan, behind a UAE residential/mobile proxy so scam kits that geo-block show their real content.
- Maps and Search coverage depend on API keys and quotas.
- crt.sh is polled, not streamed, and is often slow. Its JSON no longer has `entry_timestamp`, so certificate `not_before` is used. Production: certstream.
- Small evaluation set. Live phishing pages disappear quickly.
- The local model is slow on CPU. If the model is not running, scans continue without the AI signal.
- Graph links ignore shared CDN/cloud IPs and mass DNS providers, which lowers false links but can miss operators who hide behind them.
- `brands.yaml` official domains and phone numbers must be checked against each brand's own site before production use.

## 12. Pilot path with Abu Dhabi Police

1. On-premise deployment (one server, Docker), connected to the police takedown team's workflow.
2. Weekly brand-list updates with UAE banks and government entities, including official helpline numbers for the Maps check.
3. Citizen channel: a WhatsApp/Telegram bot on the same `/api/scan` endpoint.
4. Feed confirmed cases back as labelled data to retrain the URL model.

## 13. Team

_Names and roles._

---

API reference: [`BUILD.md` section 10](BUILD.md). Front end: `frontend/` (React). Backend: `backend/app/`.
