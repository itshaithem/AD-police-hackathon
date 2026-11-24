"""Fraud network: domains linked by shared IP, ASN, phone, form template, page hash, certificate, nameserver."""
import hashlib

import networkx as nx

from . import db

MAX_INDICATOR_DEGREE = 25  # drop CDN IPs, big registrars etc. so clusters stay meaningful
INDICATOR_LABELS = {"ip": "Shared IP", "asn": "ASN", "phone": "Phone number", "form": "Form template",
                    "phash": "Page look (perceptual hash)", "cert": "TLS certificate", "ns": "Name server"}


def _indicators(s: dict):
    intel = s.get("intel") or {}
    h, t, w = intel.get("hosting") or {}, intel.get("tls") or {}, intel.get("whois") or {}
    c, v = s.get("content") or {}, s.get("visual") or {}
    if h.get("ip"): yield "ip", h["ip"]
    if h.get("asn"): yield "asn", str(h["asn"])
    for p in c.get("phones", []): yield "phone", "".join(ch for ch in p if ch.isdigit())[-9:]
    if c.get("form_signature"): yield "form", hashlib.sha1(c["form_signature"].encode()).hexdigest()[:10]
    if v.get("phash"): yield "phash", v["phash"][:12]
    if t.get("serial"): yield "cert", t["serial"]
    for n in (w.get("nameservers") or [])[:4]: yield "ns", n.lower()


def build(min_score=40, limit=500) -> dict:
    scans = {}
    for s in db.list_scans(limit=limit, min_score=min_score):
        scans.setdefault(s["domain"], s)  # newest scan per domain
    G = nx.Graph()
    for d, s in scans.items():
        G.add_node(f"domain:{d}", type="domain", label=d, score=s["score"], scan_id=s["id"],
                   brand=(s.get("brand") or {}).get("id"))
        for typ, val in _indicators(s):
            nid = f"{typ}:{val}"
            G.add_node(nid, type=typ, label=val)
            G.add_edge(f"domain:{d}", nid, type=typ)
    G.remove_nodes_from([n for n, a in list(G.nodes(data=True)) if a["type"] != "domain" and G.degree(n) > MAX_INDICATOR_DEGREE])
    # Indicators connected to only one domain link nothing.
    G.remove_nodes_from([n for n, a in list(G.nodes(data=True)) if a["type"] != "domain" and G.degree(n) < 2])

    clusters = []
    for comp in nx.connected_components(G):
        doms = sorted(G.nodes[n]["label"] for n in comp if G.nodes[n]["type"] == "domain")
        if len(doms) < 2:
            continue
        shared = [{"type": G.nodes[n]["type"], "label": INDICATOR_LABELS.get(G.nodes[n]["type"], G.nodes[n]["type"]),
                   "value": G.nodes[n]["label"], "domains": G.degree(n)}
                  for n in comp if G.nodes[n]["type"] != "domain"]
        shared.sort(key=lambda x: -x["domains"])
        dn = [G.nodes[f"domain:{d}"] for d in doms]
        brands = [x["brand"] for x in dn if x.get("brand")]
        clusters.append({
            "id": "c_" + hashlib.sha1("|".join(doms).encode()).hexdigest()[:8],
            "domains": [{"name": x["label"], "score": x["score"], "scan_id": x["scan_id"]} for x in dn],
            "scan_ids": [x["scan_id"] for x in dn],
            "shared_indicators": shared,
            "max_score": max(x["score"] for x in dn),
            "brand": max(set(brands), key=brands.count) if brands else None,
        })
    clusters.sort(key=lambda c: (-len(c["domains"]), -c["max_score"]))
    in_cluster = {d["name"] for c in clusters for d in c["domains"]}
    nodes = [{"id": n, "type": a["type"], "label": a["label"], **({"score": a["score"]} if a["type"] == "domain" else {})}
             for n, a in G.nodes(data=True) if a["type"] != "domain" or a["label"] in in_cluster]
    keep = {n["id"] for n in nodes}
    edges = [{"source": u, "target": v, "type": a["type"]} for u, v, a in G.edges(data=True) if u in keep and v in keep]
    return {"nodes": nodes, "edges": edges, "clusters": clusters}
