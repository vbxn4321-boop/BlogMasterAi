from pathlib import Path

import edge_tts

from config import TTS_VOICE


async def synthesize(text: str, mp3_path: Path, srt_path: Path) -> None:
    communicate = edge_tts.Communicate(text, TTS_VOICE, boundary="WordBoundary")
    submaker = edge_tts.SubMaker()

    with open(mp3_path, "wb") as audio_file:
        async for chunk in communicate.stream():
            if chunk["type"] == "audio":
                audio_file.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                submaker.feed(chunk)

    srt_path.write_text(submaker.get_srt(), encoding="utf-8")
