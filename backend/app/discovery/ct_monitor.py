"""Certificate Transparency via crt.sh: new certificates for names containing brand keywords."""
import asyncio
import datetime as dt
import re

import httpx

from .. import db, watchlist
from ..config import CT_MAX_AGE_DAYS, CT_MAX_PER_KEYWORD, CT_PER_CYCLE, CT_RETRIES, CT_TIMEOUT_SEC
from ..pipeline.url_features import BRANDS, is_allowlisted, registered_domain

DOMAIN_RE = re.compile(r"^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


last_stats = {"queries": 0, "failed": 0, "rate_limited": False}


async def _query(c, kw, sem):
    async with sem:
        if last_stats["rate_limited"]:
            return []  # 429 applies to the whole client, so stop asking for the rest of this run
        last_stats["queries"] += 1
        for _ in range(max(1, CT_RETRIES)):
            try:
                r = await c.get("https://crt.sh/", params={"q": f"%{kw}%", "output": "json", "exclude": "expired"})
                if r.status_code == 200:
                    return r.json()
                if r.status_code == 429:
                    last_stats["rate_limited"] = True
                    break  # backing off is the only useful response; the next run tries again
                if r.status_code < 500:
                    break  # a real answer, just not one we can use
            except Exception:
                break  # a timeout has already spent the budget; retrying would only spend more
            await asyncio.sleep(2)
        last_stats["failed"] += 1  # this keyword comes round again on the next lap
        return []


def candidates(rows: list, cutoff: dt.datetime, cap: int) -> list[tuple[str, str]]:
    """Newest-first (registered domain, cert not_before) pairs worth scanning, from crt.sh rows.

    name_value also carries organisation names ("aramex international l.l.c"), which the domain
    regex drops, and the brand's own domains, which the allowlist drops.
    """
    if cap <= 0:
        return []
    out, seen = [], set()
    for r in sorted(rows, key=lambda x: (x.get("not_before") or ""), reverse=True):
        nb = (r.get("not_before") or "")[:19]
        if not nb:
            continue
        try:
            if dt.datetime.fromisoformat(nb) < cutoff:
                continue
        except ValueError:
            continue
        for name in (r.get("name_value") or "").splitlines():
            name = name.strip().lower()
            if not DOMAIN_RE.match(name):
                continue
            rd = registered_domain(name.lstrip("*.")) or name
            if rd in seen or is_allowlisted(rd):
                continue
            seen.add(rd)
            out.append((rd, nb))
            if len(out) >= cap:
                return out
    return out


async def poll():
    """Certificates naming a brand keyword. UAE brands only — global ones return far too much."""
    cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(days=CT_MAX_AGE_DAYS)
    jobs = [(b, kw) for b in BRANDS if b.get("region") != "global" and b["id"] != "saqrbank" and watchlist.polls(b)
            for kw in b["keywords"] if len(kw.strip("-")) >= 4]
    # crt.sh is slow enough that the full list never finished inside the poll budget.
    jobs = db.slice_by_cursor(jobs, "ct_cursor", CT_PER_CYCLE)
    last_stats.update(queries=0, failed=0, rate_limited=False)
    sem = asyncio.Semaphore(1)  # one at a time: concurrency is what tripped crt.sh's rate limit
    async with httpx.AsyncClient(timeout=CT_TIMEOUT_SEC) as c:
        results = await asyncio.gather(*(_query(c, kw.strip("-"), sem) for _, kw in jobs))
    found, seen = [], set()
    for (b, _), rows in zip(jobs, results):
        for rd, nb in candidates(rows, cutoff, CT_MAX_PER_KEYWORD):
            if rd in seen:
                continue
            seen.add(rd)
            # detected_at is when discovery found it, not when the certificate was issued.
            found.append({"source": "ct", "kind": "domain", "item": rd, "brand": b["id"],
                          "meta": {"cert_not_before": nb}})
    return found


def demo():
    """Self-check: python -m app.discovery.ct_monitor"""
    cutoff = dt.datetime(2026, 1, 1)
    rows = [
        {"not_before": "2026-09-24T00:00:00", "name_value": "aramexgo.com\n*.aramexgo.com"},
        {"not_before": "2026-05-01T00:00:00", "name_value": "aramex international l.l.c"},  # org name, not a domain
        {"not_before": "2026-04-01T00:00:00", "name_value": "aramex.com"},                  # official -> allowlisted
        {"not_before": "2020-01-01T00:00:00", "name_value": "tooold.com"},                  # older than the cutoff
        {"not_before": "", "name_value": "nodate.com"},
    ]
    got = candidates(rows, cutoff, 20)
    assert [d for d, _ in got] == ["aramexgo.com"], got      # wildcard folded in, org/official/old dropped
    assert got[0][1] == "2026-09-24T00:00:00"
    assert candidates(rows, cutoff, 0) == []
    newest = candidates([{"not_before": f"2026-0{i}-01T00:00:00", "name_value": f"x{i}.com"} for i in (1, 9, 5)], cutoff, 2)
    assert [d for d, _ in newest] == ["x9.com", "x5.com"], newest   # newest first
    print("ct ok")


if __name__ == "__main__":
    demo()
