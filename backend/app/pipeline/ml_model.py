"""Optional trained URL classifier (see app/train_url_model.py)."""
import joblib

from ..config import DATA_DIR

NUM = ["url_len", "host_len", "digits", "hyphens", "entropy", "subdomain_depth", "path_len", "query_len"]
BOOL = ["is_ip", "punycode", "has_at", "suspicious_tld", "free_host", "shortener"]
MODEL_PATH = DATA_DIR / "url_model.joblib"
_m = None


def vec(f):
    return [f[k] for k in NUM] + [int(f[k]) for k in BOOL] + [len(f["keywords"]), int(bool(f["brand_imitation"]))]


def predict(f):
    global _m
    if _m is None and MODEL_PATH.exists():
        _m = joblib.load(MODEL_PATH)
    return float(_m.predict_proba([vec(f)])[0][1]) if _m else None
