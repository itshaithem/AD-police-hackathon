"""Discovery loop: run all pollers, store new items, auto-scan new domains/URLs."""
import asyncio
import logging

from .. import db
from ..config import DISCOVERY_INTERVAL_MIN, SCAN_CONCURRENCY
from ..pipeline import run_scan
from . import ct_monitor, lookalikes, maps, search

log = logging.getLogger(__name__)
_running = asyncio.Lock()
_sem = asyncio.Semaphore(SCAN_CONCURRENCY)
last_run: dict = {}


async def _scan_item(did: str, d: dict):
    target = d["item"] if d["kind"] in ("domain", "url") else (d.get("meta") or {}).get("website")
    if not target:
        return
    async with _sem:
        try:
            r = await asyncio.wait_for(run_scan(target, source=d["source"]), timeout=90)
            db.set_discovery_scan(did, r["id"])
        except Exception as e:
            log.warning("auto-scan failed for %s: %s", target, e)


async def run_once(include_dnstwist=False) -> dict:
    """Run every poller once. Returns counts of new items per source."""
    if _running.locked():
        return {"status": "already running"}
    async with _running:
        results = await asyncio.gather(ct_monitor.poll(), lookalikes.poll(include_dnstwist), search.poll(), maps.poll(),
                                       return_exceptions=True)
        counts, tasks = {}, []
        for name, res in zip(("ct", "lookalike", "search", "maps"), results):
            if isinstance(res, Exception):
                log.warning("poller %s failed: %s", name, res)
                counts[name] = "error"
                continue
            n = 0
            for d in res:
                did = db.insert_discovery(d)
                if did:
                    n += 1
                    tasks.append(_scan_item(did, d))
            counts[name] = n
        last_run.update(at=db.now(), counts=counts)
    await asyncio.gather(*tasks)
    return counts


async def forever():
    while True:
        try:
            await run_once(include_dnstwist=True)
        except Exception as e:
            log.warning("discovery run failed: %s", e)
        await asyncio.sleep(DISCOVERY_INTERVAL_MIN * 60)
