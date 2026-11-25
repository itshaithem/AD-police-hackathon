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
DISCOVERY_INTERVAL_MIN = int(env("DISCOVERY_INTERVAL_MIN", "20"))
DEMO_MODE = flag("DEMO_MODE")
SCAN_CONCURRENCY = int(env("SCAN_CONCURRENCY", "3"))
