"""DNS, RDAP/WHOIS, TLS and IP/ASN intelligence for a host."""
import asyncio
import datetime as dt
import socket
import ssl

import dns.asyncresolver
import httpx
from cryptography import x509


async def resolve(host):
    out = {"a": [], "mx": [], "ns": []}
    r = dns.asyncresolver.Resolver()
    r.lifetime = 4
    for t, k in (("A", "a"), ("MX", "mx"), ("NS", "ns")):
        try:
            out[k] = [x.to_text() for x in await r.resolve(host, t)]
        except Exception:
            pass
    return out


def _vcard(ent, field):
    return next((v[3] for v in (ent.get("vcardArray") or [None, []])[1] if v[0] == field), None)


async def rdap(domain):
    try:
        async with httpx.AsyncClient(timeout=8, follow_redirects=True) as c:
            r = await c.get(f"https://rdap.org/domain/{domain}")
            if r.status_code != 200:
                return {"error": f"rdap status {r.status_code}"}
            j = r.json()
        ev = {e.get("eventAction"): e.get("eventDate") for e in j.get("events", [])}
        registrar, abuse = None, None
        for ent in j.get("entities", []):
            if "registrar" in ent.get("roles", []):
                registrar = _vcard(ent, "fn")
                for sub in ent.get("entities", []):
                    if "abuse" in sub.get("roles", []):
                        abuse = _vcard(sub, "email")
        created = ev.get("registration")
        age = None
        if created:
            age = (dt.datetime.now(dt.timezone.utc) - dt.datetime.fromisoformat(created.replace("Z", "+00:00"))).days
        return {"created": created, "age_days": age, "registrar": registrar, "abuse_email": abuse,
                "nameservers": [n.get("ldhName") for n in j.get("nameservers", [])], "raw_source": "rdap.org"}
    except Exception as e:
        return {"error": str(e)[:200]}


def _tls(host):
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    with socket.create_connection((host, 443), timeout=5) as s, ctx.wrap_socket(s, server_hostname=host) as ss:
        cert = x509.load_der_x509_certificate(ss.getpeercert(binary_form=True))
    nb = cert.not_valid_before_utc
    return {"issuer": cert.issuer.rfc4514_string(), "subject": cert.subject.rfc4514_string(),
            "not_before": nb.isoformat(), "serial": format(cert.serial_number, "x"),
            "cert_age_days": (dt.datetime.now(dt.timezone.utc) - nb).days}


async def tls(host):
    try:
        return await asyncio.to_thread(_tls, host)
    except Exception as e:
        return {"error": str(e)[:200]}


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
    if host.endswith(".test"):  # local fictional demo sites: no public intel exists
        return {"dns": {"a": [], "mx": [], "ns": []}, "whois": {"error": "demo domain"}, "tls": {}, "hosting": {}}
    d, w, t = await asyncio.gather(resolve(host), rdap(domain), tls(host))
    ipi = await ip_info(d["a"][0]) if d["a"] else {}
    return {"dns": d, "whois": w, "tls": t, "hosting": ipi}
