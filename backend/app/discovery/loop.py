"""Discovery loop: run all pollers, store new items, auto-scan within a time budget.

A cycle must finish well inside DISCOVERY_INTERVAL_MIN, or the interval stops meaning anything:
a look-alike sweep can yield thousands of candidates and scanning them all would hold the cycle
open for hours. So each cycle scans what it can inside SCAN_BUDGET_SEC, newest first, and later
cycles drain the rest from the backlog.
"""
import asyncio
import logging
import time

from .. import db, watchlist
from ..config import DISCOVERY_INTERVAL_MIN, POLL_BUDGET_SEC, SCAN_BUDGET_SEC, SCAN_CONCURRENCY
from ..pipeline import run_scan
from . import ct_monitor, lookalikes, maps, search

log = logging.getLogger(__name__)
_running = asyncio.Lock()
_sem = asyncio.Semaphore(SCAN_CONCURRENCY)
last_run: dict = {}


def scan_queue(fresh: list[tuple[str, dict]], backlog: list[dict]) -> list[tuple[str, dict]]:
    """This cycle's scan order: new finds first, then the oldest unscanned, no duplicates."""
    seen = {did for did, _ in fresh}
    return fresh + [(d["id"], d) for d in backlog if d["id"] not in seen]


async def _scan_item(did: str, d: dict, deadline: float):
    target = d["item"] if d["kind"] in ("domain", "url") else (d.get("meta") or {}).get("website")
    if not target or time.monotonic() > deadline:
        return  # out of budget: it stays in the backlog and a later cycle picks it up
    async with _sem:
        if time.monotonic() > deadline:
            return
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
        wl_active = watchlist.rotate()  # this cycle's slice of the watchlist; built-in brands always run
        # crt.sh in particular can hang for minutes. Take whatever finished inside the budget and
        # drop the stragglers; the next cycle asks again.
        jobs = {"ct": ct_monitor.poll(), "lookalike": lookalikes.poll(include_dnstwist),
                "search": search.poll(), "maps": maps.poll()}
        tasks = {asyncio.create_task(c): name for name, c in jobs.items()}
        done, pending = await asyncio.wait(tasks, timeout=POLL_BUDGET_SEC)
        for t in pending:
            t.cancel()
        results = {tasks[t]: (t.exception() or t.result()) for t in done}
        counts, fresh = {}, []
        for name in jobs:
            res = results.get(name)
            if res is None:
                log.warning("poller %s timed out after %ss", name, POLL_BUDGET_SEC)
                counts[name] = "timeout"
                continue
            if isinstance(res, BaseException):
                log.warning("poller %s failed: %s", name, res)
                counts[name] = "error"
                continue
            n = 0
            for d in res:
                did = db.insert_discovery(d)
                if did:
                    n += 1
                    fresh.append((did, d))
            counts[name] = n
        queue = scan_queue(fresh, db.list_unscanned(200))
        deadline = time.monotonic() + SCAN_BUDGET_SEC
        await asyncio.gather(*(_scan_item(did, d, deadline) for did, d in queue))
        pending = db.C.execute("SELECT COUNT(*) FROM discoveries WHERE scan_id IS NULL").fetchone()[0]
        last_run.update(at=db.now(), counts=counts, watchlist_active=len(wl_active), places=maps.last_status["state"],
                        unscanned_backlog=pending,
                        ct_queries_failed=f"{ct_monitor.last_stats['failed']}/{ct_monitor.last_stats['queries']}")
    return counts


async def forever():
    """Start a cycle every DISCOVERY_INTERVAL_MIN, rather than waiting that long after each one.

    Sleeping a full interval *after* the work made the real gap interval + cycle duration (9 min
    for a 5-minute setting). Sleeping the remainder keeps the cadence the number actually says;
    if a cycle ever overruns the interval the next starts immediately.
    """
    period = DISCOVERY_INTERVAL_MIN * 60
    while True:
        started = time.monotonic()
        try:
            # dnstwist runs every cycle now, but only over a rotating handful of official domains
            # (see lookalikes.twist_slice) so it fits inside the poll budget.
            await run_once(include_dnstwist=True)
        except Exception as e:
            log.warning("discovery run failed: %s", e)
        await asyncio.sleep(max(0, period - (time.monotonic() - started)))


def demo():
    """Self-check: python -m app.discovery.loop"""
    fresh = [("a", {"id": "a"}), ("b", {"id": "b"})]
    backlog = [{"id": "b"}, {"id": "c"}, {"id": "d"}]
    q = scan_queue(fresh, backlog)
    assert [i for i, _ in q] == ["a", "b", "c", "d"], q      # new first, backlog after, "b" not repeated
    assert scan_queue([], backlog) == [("b", backlog[0]), ("c", backlog[1]), ("d", backlog[2])]
    assert scan_queue(fresh, []) == fresh
    print("loop ok")


if __name__ == "__main__":
    demo()
