"""Certificate Transparency via crt.sh: new certificates for names containing brand keywords."""
import asyncio
import datetime as dt
import re

import httpx

from .. import watchlist
from ..pipeline.url_features import BRANDS, is_allowlisted, registered_domain

DOMAIN_RE = re.compile(r"^(?:\*\.)?(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$")


last_stats = {"queries": 0, "failed": 0}


async def _query(c, kw, sem):
    async with sem:
        last_stats["queries"] += 1
        try:
            r = await c.get("https://crt.sh/", params={"q": f"%{kw}%", "output": "json", "exclude": "expired"})
            return r.json()
        except Exception:
            last_stats["failed"] += 1  # crt.sh is often slow or rate-limited; skip this keyword
            return []


async def poll(hours=48):
    """New certificates for UAE brand keywords (global brands return too much to poll this way)."""
    cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(hours=hours)
    jobs = [(b, kw) for b in BRANDS if b.get("region") != "global" and b["id"] != "saqrbank" and watchlist.polls(b)
            for kw in b["keywords"] if len(kw.strip("-")) >= 4]
    last_stats.update(queries=0, failed=0)
    sem = asyncio.Semaphore(4)
    async with httpx.AsyncClient(timeout=45) as c:
        results = await asyncio.gather(*(_query(c, kw.strip("-"), sem) for _, kw in jobs))
    found, seen = [], set()
    for (b, _), rows in zip(jobs, results):
        for r in rows:
            # crt.sh dropped entry_timestamp from its JSON; not_before is the closest stand-in.
            ts = (r.get("entry_timestamp") or r.get("not_before") or "")[:19]
            if not ts or dt.datetime.fromisoformat(ts) < cutoff:
                continue
            for name in (r.get("name_value") or "").splitlines():
                name = name.strip().lower()
                if not DOMAIN_RE.match(name):
                    continue  # crt.sh also lists organisation names here
                rd = registered_domain(name.lstrip("*.")) or name
                if rd in seen or is_allowlisted(rd):
                    continue
                seen.add(rd)
                found.append({"source": "ct", "kind": "domain", "item": rd, "brand": b["id"],
                              "detected_at": ts + "+00:00", "meta": {"cert_name": name}})
    return found
