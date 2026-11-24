"""Local small language model analysis (Arabic + English) via Ollama. Data never leaves the server."""
import json

import httpx

from ..config import LLM_ENABLED, OLLAMA_MODEL, OLLAMA_URL

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
    if not LLM_ENABLED:
        return None
    body = {"model": OLLAMA_MODEL, "stream": False, "format": "json", "think": False,
            "options": {"temperature": 0.1},
            "messages": [{"role": "user", "content": PROMPT.format(
                url=url, official=official, title=content["title"], asks=content["asks_for"],
                text=content["text_excerpt"][:2500])}]}
    try:
        async with httpx.AsyncClient(timeout=45) as c:
            r = await c.post(f"{OLLAMA_URL}/api/chat", json=body)
            r.raise_for_status()
        return json.loads(r.json()["message"]["content"])
    except Exception as e:
        return {"error": str(e)[:200] or type(e).__name__}


async def healthy() -> bool:
    if not LLM_ENABLED:
        return False
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            return (await c.get(f"{OLLAMA_URL}/api/tags")).status_code == 200
    except Exception:
        return False
