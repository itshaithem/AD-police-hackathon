import datetime as dt
import json
import sqlite3
import threading
import uuid

from .config import DATA_DIR

_DB = DATA_DIR / "scamshield.db"
_lock = threading.Lock()

C = sqlite3.connect(_DB, check_same_thread=False)
C.row_factory = sqlite3.Row
C.executescript("""
CREATE TABLE IF NOT EXISTS scans(id TEXT PRIMARY KEY, url TEXT, final_url TEXT, domain TEXT,
  score INT, verdict TEXT, brand TEXT, source TEXT, created_at TEXT, result TEXT);
CREATE INDEX IF NOT EXISTS ix_scans_domain ON scans(domain);
CREATE TABLE IF NOT EXISTS discoveries(id TEXT PRIMARY KEY, source TEXT, item TEXT, kind TEXT,
  brand TEXT, detected_at TEXT, scan_id TEXT, meta TEXT, UNIQUE(source,item));
CREATE TABLE IF NOT EXISTS cases(id TEXT PRIMARY KEY, title TEXT, status TEXT, created_at TEXT,
  scan_ids TEXT, cluster_id TEXT);
CREATE TABLE IF NOT EXISTS jobs(id TEXT PRIMARY KEY, status TEXT, total INT, done INT, created_at TEXT, out_path TEXT);
CREATE TABLE IF NOT EXISTS kv(k TEXT PRIMARY KEY, v TEXT);
""")


def now():
    return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")


def new_id(p):
    return f"{p}_{uuid.uuid4().hex[:10]}"


def _exec(sql, args=()):
    with _lock:
        cur = C.execute(sql, args)
        C.commit()
        return cur


# ---------- kv (watchlist, rotation cursor) ----------
def kv_get(k, default=None):
    r = C.execute("SELECT v FROM kv WHERE k=?", (k,)).fetchone()
    return json.loads(r["v"]) if r else default


def kv_set(k, v):
    _exec("INSERT OR REPLACE INTO kv VALUES(?,?)", (k, json.dumps(v, ensure_ascii=False)))


# ---------- scans ----------
def save_scan(r: dict):
    _exec("INSERT OR REPLACE INTO scans VALUES(?,?,?,?,?,?,?,?,?,?)",
          (r["id"], r["url"], r.get("final_url"), r.get("domain"), r["score"], r["verdict"],
           (r.get("brand") or {}).get("id"), r.get("source", "manual"), r["created_at"], json.dumps(r, default=str)))


def get_scan(sid):
    row = C.execute("SELECT result FROM scans WHERE id=?", (sid,)).fetchone()
    return json.loads(row["result"]) if row else None


def latest_scan_for_domain(domain):
    row = C.execute("SELECT result FROM scans WHERE domain=? ORDER BY created_at DESC LIMIT 1", (domain,)).fetchone()
    return json.loads(row["result"]) if row else None


def list_scans(limit=100, min_score=0):
    rows = C.execute("SELECT result FROM scans WHERE score>=? ORDER BY created_at DESC LIMIT ?", (min_score, limit))
    return [json.loads(r["result"]) for r in rows]


# ---------- discoveries ----------
def insert_discovery(d: dict) -> str | None:
    """Insert a discovery; returns its id, or None if (source, item) was already known."""
    did = new_id("disc")
    cur = _exec("INSERT OR IGNORE INTO discoveries VALUES(?,?,?,?,?,?,?,?)",
                (did, d["source"], d["item"], d["kind"], d.get("brand"), d.get("detected_at") or now(),
                 d.get("scan_id"), json.dumps(d.get("meta") or {})))
    return did if cur.rowcount else None


def set_discovery_scan(did, scan_id):
    _exec("UPDATE discoveries SET scan_id=? WHERE id=?", (scan_id, did))


def list_unscanned(limit=50):
    """Discoveries that never got a scan, newest first — the auto-scan backlog."""
    out = []
    for r in C.execute("SELECT * FROM discoveries WHERE scan_id IS NULL ORDER BY detected_at DESC LIMIT ?", (limit,)):
        d = dict(r)
        d["meta"] = json.loads(d["meta"] or "{}")
        out.append(d)
    return out


def list_discoveries(source=None, limit=200):
    q, a = "SELECT * FROM discoveries", []
    if source:
        q += " WHERE source LIKE ?"
        a.append(source + "%")
    q += " ORDER BY detected_at DESC LIMIT ?"
    a.append(limit)
    out = []
    for r in C.execute(q, a):
        d = dict(r)
        d["meta"] = json.loads(d["meta"] or "{}")
        out.append(d)
    return out


# ---------- cases ----------
def create_case(title, scan_ids, cluster_id=None):
    n = C.execute("SELECT COUNT(*) FROM cases").fetchone()[0]
    cid = f"AD-{2612 + n}"
    _exec("INSERT INTO cases VALUES(?,?,?,?,?,?)", (cid, title, "open", now(), json.dumps(scan_ids), cluster_id))
    return get_case(cid)


def get_case(cid):
    r = C.execute("SELECT * FROM cases WHERE id=?", (cid,)).fetchone()
    if not r:
        return None
    d = dict(r)
    d["scan_ids"] = json.loads(d["scan_ids"])
    return d


def list_cases():
    return [get_case(r["id"]) for r in C.execute("SELECT id FROM cases ORDER BY created_at DESC")]


def update_case(cid, **fields):
    for k, v in fields.items():
        if k == "scan_ids":
            v = json.dumps(v)
        _exec(f"UPDATE cases SET {k}=? WHERE id=?", (v, cid))  # k comes from a fixed whitelist in main.py
    return get_case(cid)


# ---------- jobs ----------
def create_job(total, out_path):
    jid = new_id("job")
    _exec("INSERT INTO jobs VALUES(?,?,?,?,?,?)", (jid, "running", total, 0, now(), out_path))
    return jid


def update_job(jid, **fields):
    for k, v in fields.items():
        _exec(f"UPDATE jobs SET {k}=? WHERE id=?", (v, jid))


def get_job(jid):
    r = C.execute("SELECT * FROM jobs WHERE id=?", (jid,)).fetchone()
    return dict(r) if r else None
