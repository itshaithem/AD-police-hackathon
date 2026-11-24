from urllib.parse import urlsplit

import httpx

from ..config import AGENT_ALLOWED_SUFFIXES, AGENT_ENABLED, SANDBOX_URL


def agent_allowed(url: str) -> bool:
    return AGENT_ENABLED and (urlsplit(url).hostname or "").lower().endswith(AGENT_ALLOWED_SUFFIXES)


async def visit(url: str, agent: bool = False):
    try:
        async with httpx.AsyncClient(timeout=60) as c:
            r = await c.post(f"{SANDBOX_URL}/visit", json={"url": url, "agent": agent and agent_allowed(url)})
            if r.status_code != 200:
                return {"error": f"sandbox refused: {r.text}"[:300], "steps": [], "redirect_chain": []}
            return r.json()
    except Exception as e:
        return {"error": f"sandbox unavailable: {e}"[:300], "steps": [], "redirect_chain": []}


async def render_pdf(html: str) -> bytes:
    async with httpx.AsyncClient(timeout=60) as c:
        r = await c.post(f"{SANDBOX_URL}/pdf", json={"html": html})
        r.raise_for_status()
        return r.content


async def healthy() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3) as c:
            return (await c.get(f"{SANDBOX_URL}/health")).status_code == 200
    except Exception:
        return False
