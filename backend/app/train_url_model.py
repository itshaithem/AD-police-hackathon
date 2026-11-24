"""Train the optional URL classifier on a public labelled URL dataset.

    python -m app.train_url_model

Dataset: Hugging Face `pirocheto/phishing-url` (columns `url` and `status` = phishing|legitimate).
Features come from our own `url_features.extract`, so the model sees exactly what the scanner sees.
Saves data/url_model.joblib; scoring uses it automatically when present.
"""
import io

import httpx
import joblib
import pandas as pd
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.metrics import classification_report

from .pipeline.ml_model import MODEL_PATH, vec
from .pipeline.url_features import extract

BASE = "https://huggingface.co/api/datasets/pirocheto/phishing-url/parquet/default"


def load(split: str):
    raw = httpx.get(f"{BASE}/{split}/0.parquet", follow_redirects=True, timeout=120).content
    d = pd.read_parquet(io.BytesIO(raw), columns=["url", "status"])
    X = [vec(extract(u)) for u in d["url"]]
    y = (d["status"] == "phishing").astype(int).tolist()
    return X, y


def main():
    Xtr, ytr = load("train")
    Xte, yte = load("test")
    m = HistGradientBoostingClassifier(max_iter=300, learning_rate=0.08, random_state=0).fit(Xtr, ytr)
    print(classification_report(yte, m.predict(Xte), target_names=["legitimate", "phishing"], digits=3))
    joblib.dump(m, MODEL_PATH)
    print(f"saved {MODEL_PATH}")


if __name__ == "__main__":
    main()
