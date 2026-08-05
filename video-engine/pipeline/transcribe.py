from pathlib import Path
from functools import lru_cache

import whisper


@lru_cache(maxsize=1)
def _load_model():
    return whisper.load_model("small")


def transcribe(video_path: Path) -> str:
    model = _load_model()
    result = model.transcribe(str(video_path), language=None, fp16=False)
    return (result.get("text") or "").strip()
