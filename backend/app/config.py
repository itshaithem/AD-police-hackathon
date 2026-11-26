import os
from pathlib import Path


def env(k, d=None):
    return os.getenv(k, d)


def flag(k, d="false"):
    return env(k, d).lower() in ("1", "true", "yes")


API_KEY = env("API_KEY", "change-me")
CORS_ORIGINS = [o.strip() for o in env("CORS_ORIGINS", "*").split(",")]
DATA_DIR = Path(env("DATA_DIR", "./data"))
EVIDENCE_DIR = DATA_DIR / "evidence"
EVIDENCE_DIR.mkdir(parents=True, exist_ok=True)
SANDBOX_URL = env("SANDBOX_URL", "http://localhost:9000")
OLLAMA_URL = env("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = env("OLLAMA_MODEL", "qwen3:4b")
LLM_ENABLED = flag("LLM_ENABLED", "true")
# AI analyst provider: "claude" (Anthropic API, vision) | "ollama" (local, on-premise) | "off"
LLM_PROVIDER = env("LLM_PROVIDER", "ollama").strip().lower()
ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY", "")
CLAUDE_MODEL = env("CLAUDE_MODEL", "claude-opus-5-5")
CLAUDE_EFFORT = env("CLAUDE_EFFORT", "medium")  # low | medium | high | xhigh | max
VISUAL_ENABLED = flag("VISUAL_ENABLED", "true")
AGENT_ENABLED = flag("AGENT_ENABLED")
# The fake-victim agent only runs on these host suffixes (fictional demo sites / authorised targets).
AGENT_ALLOWED_SUFFIXES = tuple(s.strip() for s in env("AGENT_ALLOWED_SUFFIXES", ".test").split(",") if s.strip())
SERPAPI_KEY = env("SERPAPI_KEY")
GOOGLE_PLACES_KEY = env("GOOGLE_PLACES_KEY")
DISCOVERY_ENABLED = flag("DISCOVERY_ENABLED", "true")
DISCOVERY_INTERVAL_MIN = int(env("DISCOVERY_INTERVAL_MIN", "5"))
# A cycle must fit inside DISCOVERY_INTERVAL_MIN or the interval stops meaning anything, so both
# halves are capped: pollers get POLL_BUDGET_SEC, auto-scanning gets SCAN_BUDGET_SEC. Whatever is
# left over waits in the backlog and later cycles drain it, so nothing is dropped.
POLL_BUDGET_SEC = int(env("POLL_BUDGET_SEC", "120"))
SCAN_BUDGET_SEC = int(env("SCAN_BUDGET_SEC", "120"))
# A dnstwist sweep costs ~23s per official domain (~4k permutations, DNS-checked), so a full pass
# over every brand would take half an hour. Rotate a few per cycle instead; ~88 domains at 3 per
# 5-minute cycle is a complete sweep roughly every 2.5 hours.
DNSTWIST_PER_CYCLE = int(env("DNSTWIST_PER_CYCLE", "3"))
# crt.sh is a free service that rate-limits (HTTP 429) and is often overloaded (502). Four
# concurrent queries tripped the limit and every query failed, so certificate monitoring produced
# nothing. Be a polite client instead: one query at a time, a few keywords on a slower beat.
# 43 keywords at 3 per run, every 6th 5-minute cycle, is a full sweep about every 90 minutes.
CT_PER_CYCLE = int(env("CT_PER_CYCLE", "3"))
CT_EVERY_N_CYCLES = int(env("CT_EVERY_N_CYCLES", "6"))
# Measured crt.sh latency spans 0.1s (a 502) to ~37s for a busy keyword, so a short timeout throws
# away good answers. 8 keywords at 4 concurrent is two batches, which still fits POLL_BUDGET_SEC.
CT_TIMEOUT_SEC = int(env("CT_TIMEOUT_SEC", "35"))
# crt.sh returns an arbitrary slice of a keyword's certificates, not the newest, so filtering by
# "issued in the last 48h" matched nothing and CT never produced a finding. Take the newest it
# does return, bounded by age, and let UNIQUE(source,item) stop repeats.
CT_MAX_AGE_DAYS = int(env("CT_MAX_AGE_DAYS", "365"))
CT_MAX_PER_KEYWORD = int(env("CT_MAX_PER_KEYWORD", "20"))
# crt.sh alternates between 502 in under a second and 200 in ~11s. Retrying the cheap failures
# turns most of them into results; a timeout has already spent the budget, so that one is final.
CT_RETRIES = int(env("CT_RETRIES", "3"))
# Places Text Search is a billed API with no free tier (~$0.017-0.032 per request). The Maps
# poller had no cap at all — every built-in brand, every 5-minute cycle, forever — which measured
# at ~36k requests/day against the live key. Rotate a slice like every other poller.
MAPS_PER_CYCLE = int(env("MAPS_PER_CYCLE", "6"))
# uae_variants re-probed the same ~7.9k candidates every cycle and found almost nothing new after
# the first pass. Rotate the keywords instead: ~20 per cycle is a full lap every ~25 minutes.
UAE_PER_CYCLE = int(env("UAE_PER_CYCLE", "20"))
# Watchlist brands polled per discovery cycle; the rest wait their turn (200 keywords would be ~15k DNS probes at once).
WATCHLIST_SLICE = int(env("WATCHLIST_SLICE", "25"))
DEMO_MODE = flag("DEMO_MODE")
SCAN_CONCURRENCY = int(env("SCAN_CONCURRENCY", "3"))
