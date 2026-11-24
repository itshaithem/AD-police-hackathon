"""Certificate Transparency via crt.sh: new certificates for names containing brand keywords."""
import datetime as dt

import httpx

from ..pipeline.url_features import BRANDS, is_allowlisted, registered_domain


async def poll(hours=48):
    found, seen = [], set()
    cutoff = dt.datetime.now(dt.timezone.utc).replace(tzinfo=None) - dt.timedelta(hours=hours)
    async with httpx.AsyncClient(timeout=40) as c:
        for b in BRANDS:
            if b["id"] == "saqrbank":
                continue
            for kw in b["keywords"]:
                try:
                    rows = (await c.get("https://crt.sh/", params={"q": f"%{kw}%", "output": "json", "exclude": "expired"})).json()
                except Exception:
                    continue  # crt.sh is often slow; just skip
                for r in rows:
                    ts = (r.get("entry_timestamp") or "")[:19]
                    if not ts or dt.datetime.fromisoformat(ts) < cutoff:
                        continue
                    for name in (r.get("name_value") or "").splitlines():
                        name = name.lstrip("*.").lower()
                        rd = registered_domain(name) or name
                        if rd in seen or is_allowlisted(rd):
                            continue
                        seen.add(rd)
                        found.append({"source": "ct", "kind": "domain", "item": rd, "brand": b["id"],
                                      "detected_at": ts + "+00:00", "meta": {"cert_name": name}})
    return found
