"""Visual similarity of a screenshot vs official brand reference pages (CLIP), plus a perceptual hash."""
import base64
import io
import logging

import imagehash
from PIL import Image

from ..config import DATA_DIR, VISUAL_ENABLED

log = logging.getLogger(__name__)
_model, _refs, _failed = None, {}, False


def _load():
    """Load CLIP and embed reference screenshots once. Returns None if CLIP is unavailable."""
    global _model, _failed
    if _model is None and not _failed:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer("clip-ViT-B-32")
            for p in (DATA_DIR / "references").glob("*.png"):  # e.g. adcb.png, saqrbank.png
                _refs[p.stem] = _model.encode(Image.open(p).convert("RGB"), normalize_embeddings=True)
        except Exception as e:  # missing package or model download failure
            log.warning("visual similarity disabled: %s", e)
            _failed = True
    return _model


def available() -> bool:
    return VISUAL_ENABLED and _load() is not None


def compare(png_b64: str) -> dict:
    img = Image.open(io.BytesIO(base64.b64decode(png_b64))).convert("RGB")
    out = {"phash": str(imagehash.phash(img)), "best_brand": None, "similarity": 0.0}
    if not VISUAL_ENABLED:
        return out
    m = _load()
    if m is None or not _refs:
        return out
    e = m.encode(img, normalize_embeddings=True)
    sims = {k: float((e * v).sum()) for k, v in _refs.items()}
    k = max(sims, key=sims.get)
    out.update(best_brand=k, similarity=round(sims[k], 3), all=sims)
    return out
