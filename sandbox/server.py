"""Isolated browser sandbox: opens a URL in a fresh mobile Chromium context and returns evidence.

The investigator never opens suspicious links; only this service does.
"""
import asyncio
import base64
import hashlib
import ipaddress
import os
import re
import socket
from urllib.parse import urlsplit

import httpx
from fastapi import FastAPI, HTTPException, Response
from playwright.async_api import async_playwright
from pydantic import BaseModel

app = FastAPI(title="ScamShield sandbox")

# Optional Chromium host-resolver rules, e.g. "MAP *.test 127.0.0.1:8090" for local demo sites.
HOST_RULES = os.getenv("SANDBOX_HOST_RULES", "")
# Hostname suffixes that may resolve to private addresses (local demo sites only).
PRIVATE_OK_SUFFIXES = tuple(s for s in os.getenv("SANDBOX_PRIVATE_OK", ".test").split(",") if s)

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


def assert_public(url: str) -> None:
    """Refuse URLs that point at private/internal addresses (SSRF guard)."""
    p = urlsplit(url)
    if p.scheme not in ("http", "https"):
        raise HTTPException(400, "only http(s) URLs are allowed")
    host = (p.hostname or "").lower()
    if not host:
        raise HTTPException(400, "missing host")
    if host.endswith(PRIVATE_OK_SUFFIXES):
        return
    try:
        addrs = {ai[4][0] for ai in socket.getaddrinfo(host, None)}
    except socket.gaierror:
        return  # unresolvable: the browser will fail on its own
    for a in addrs:
        ip = ipaddress.ip_address(a)
        if ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved or ip.is_multicast:
            raise HTTPException(400, f"refusing to visit internal address {a}")


def canary_for(f: dict) -> str:
    s = " ".join([f.get(k, "") or "" for k in ("type", "name", "id", "placeholder", "autocomplete", "label")]).lower()
    if f.get("type") == "password": return CANARY["password"]
    if any(k in s for k in ("cvv", "cvc", "csc")): return CANARY["cvv"]
    if any(k in s for k in ("cc-number", "card", "pan", "بطاقة")): return CANARY["card"]
    if any(k in s for k in ("exp", "انتهاء")): return CANARY["exp"]
    if any(k in s for k in ("otp", "code", "رمز", "verification")): return CANARY["otp"]
    if any(k in s for k in ("emirates", "eid", "هوية", "784")): return CANARY["eid"]
    if any(k in s for k in ("plate", "لوحة")): return CANARY["plate"]
    if f.get("type") == "email" or "mail" in s: return CANARY["email"]
    if f.get("type") == "tel" or any(k in s for k in ("phone", "mobile", "هاتف", "جوال")): return CANARY["phone"]
    if any(k in s for k in ("name", "اسم")): return CANARY["name"]
    return CANARY["text"]


async def snapshot(page, label):
    png = await page.screenshot(full_page=False)
    try:
        text = (await page.inner_text("body"))[:20000]
    except Exception:
        text = ""
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
        return {"error": str(e)[:300]}


async def agent_walk(page, out):
    """'Fake victim' walk-through with canary data, max 3 steps."""
    for i in range(3):
        fields = page.locator("input:visible, textarea:visible")
        n = await fields.count()
        if n == 0:
            break
        forms = await page.evaluate(FORM_JS)
        for j in range(min(n, 12)):
            f = forms[j] if j < len(forms) else {"type": "text"}
            if f.get("type") in ("checkbox", "radio", "hidden", "submit", "button"):
                continue
            try:
                await fields.nth(j).fill(canary_for(f), timeout=2000)
            except Exception:
                pass
        btn = page.locator("button:visible, input[type=submit]:visible, a[role=button]:visible")
        clicked = False
        for k in range(await btn.count()):
            b = btn.nth(k)
            is_input = await b.evaluate("e => e.tagName") == "INPUT"
            label = (await b.get_attribute("value") or "") if is_input else await b.inner_text()
            if SUBMIT_WORDS.search(label or ""):
                await b.click(timeout=3000)
                clicked = True
                break
        if not clicked:
            break
        await page.wait_for_timeout(2500)
        out["steps"].append(await snapshot(page, f"agent_step_{i + 1}"))


class PdfReq(BaseModel):
    html: str


@app.get("/health")
async def health():
    return {"ok": True}


@app.post("/pdf")
async def pdf(req: PdfReq):
    """Render the backend's own report HTML to PDF (Chromium shapes Arabic correctly). No network access."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=["--no-sandbox", "--disable-dev-shm-usage"])
        try:
            page = await browser.new_page()
            await page.route("**/*", lambda route: route.abort() if not route.request.url.startswith("data:") else route.continue_())
            await page.set_content(req.html, wait_until="load")
            data = await page.pdf(format="A4", print_background=True)
        finally:
            await browser.close()
    return Response(content=data, media_type="application/pdf")


@app.post("/visit")
async def visit(req: VisitReq):
    assert_public(req.url)
    out = {"requested_url": req.url, "redirect_chain": [], "network": [], "steps": [], "error": None}
    bot_task = asyncio.create_task(bot_view(req.url))
    args = ["--no-sandbox", "--disable-dev-shm-usage"]
    if HOST_RULES:
        args.append(f"--host-resolver-rules={HOST_RULES}")
    async with async_playwright() as p:
        browser = await p.chromium.launch(args=args)
        ctx = await browser.new_context(**p.devices["iPhone 13"], locale="ar-AE",
                                        timezone_id="Asia/Dubai", ignore_https_errors=True)
        page = await ctx.new_page()
        page.on("request", lambda r: len(out["network"]) < 400 and out["network"].append(
            {"url": r.url, "method": r.method, "type": r.resource_type}))
        try:
            resp = await page.goto(req.url, wait_until="domcontentloaded", timeout=req.timeout_ms)
            r = resp.request if resp else None
            chain = []
            while r:
                chain.insert(0, r.url)
                r = r.redirected_from
            await page.wait_for_timeout(2500)  # allow JS redirects
            if page.url not in chain:
                chain.append(page.url)
            out["redirect_chain"] = chain
            out["status"] = resp.status if resp else None
            out["final_url"] = page.url
            html = await page.content()
            out["html_sha256"] = hashlib.sha256(html.encode()).hexdigest()
            out["html"] = html[:300000]
            out["steps"].append(await snapshot(page, "landing"))
            if req.agent:
                await agent_walk(page, out)
        except Exception as e:
            out["error"] = str(e)[:500]
        finally:
            await ctx.close()
            await browser.close()
    out["bot_view"] = await bot_task
    return out
