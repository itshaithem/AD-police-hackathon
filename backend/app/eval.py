"""Evaluate the detector on a labelled CSV (columns: url, label with 1 = scam, 0 = legit).

    python -m app.eval data/eval/labeled.csv            # full pipeline (sandbox)
    python -m app.eval data/eval/labeled.csv --fast     # URL features + network intel only

Prints precision, recall, F1, false-positive rate (overall and on official UAE domains) and the confusion
matrix, at both thresholds: "scam" (score >= 70) and "suspicious or worse" (score >= 40).
"""
import argparse
import asyncio
import csv
import json
import tempfile
from pathlib import Path

from .cli import score_urls
from .pipeline.scoring import SCAM_AT, SUSPICIOUS_AT
from .pipeline.url_features import BRANDS, extract

OFFICIAL = {od for b in BRANDS for od in b["official_domains"]}


def metrics(y, p):
    tp = sum(1 for a, b in zip(y, p) if a and b)
    fp = sum(1 for a, b in zip(y, p) if not a and b)
    fn = sum(1 for a, b in zip(y, p) if a and not b)
    tn = sum(1 for a, b in zip(y, p) if not a and not b)
    prec = tp / (tp + fp) if tp + fp else 0.0
    rec = tp / (tp + fn) if tp + fn else 0.0
    f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
    fpr = fp / (fp + tn) if fp + tn else 0.0
    return {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(f1, 3), "fpr": round(fpr, 3),
            "tp": tp, "fp": fp, "fn": fn, "tn": tn}


def main(argv=None):
    ap = argparse.ArgumentParser(prog="python -m app.eval")
    ap.add_argument("labeled")
    ap.add_argument("--fast", action="store_true")
    ap.add_argument("--out", help="also write per-URL predictions here")
    a = ap.parse_args(argv)

    with open(a.labeled, newline="", encoding="utf-8-sig") as f:
        rows = [r for r in csv.DictReader(f) if r.get("url")]
    urls, labels = [r["url"].strip() for r in rows], [int(r["label"]) for r in rows]
    out = a.out or str(Path(tempfile.gettempdir()) / "scamshield_eval_predictions.csv")
    res = asyncio.run(score_urls(urls, out, a.fast))

    scores = [r["score"] if isinstance(r["score"], int) else 0 for r in res]
    errors = sum(1 for r in res if r["verdict"] == "error")
    official_idx = [i for i, u in enumerate(urls) if extract(u)["domain"] in OFFICIAL]
    report = {"dataset": a.labeled, "mode": "fast" if a.fast else "full", "n": len(urls),
              "scams": sum(labels), "legit": len(labels) - sum(labels), "errors": errors}
    for name, th in (("scam>=70", SCAM_AT), ("suspicious>=40", SUSPICIOUS_AT)):
        pred = [s >= th for s in scores]
        m = metrics(labels, pred)
        m["fpr_official_uae"] = round(sum(pred[i] for i in official_idx) / max(1, len(official_idx)), 3)
        report[name] = m
    print(json.dumps(report, indent=2))
    print(f"\nPer-URL predictions: {out}")
    missed = [(u, s) for u, y, s in zip(urls, labels, scores) if y and s < SUSPICIOUS_AT][:10]
    false_pos = [(u, s) for u, y, s in zip(urls, labels, scores) if not y and s >= SUSPICIOUS_AT]
    if false_pos:
        print("\nFalse positives (legit scored >= 40):", *[f"  {s:3d}  {u}" for u, s in false_pos], sep="\n")
    if missed:
        print("\nSample of missed scams (score < 40):", *[f"  {s:3d}  {u}" for u, s in missed], sep="\n")


if __name__ == "__main__":
    main()
