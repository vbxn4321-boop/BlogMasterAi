from pathlib import Path

from config import OUTPUTS_DIR
from pipeline.script_writer import write_shorts_script
from pipeline.tts import synthesize
from pipeline.video_render import get_audio_duration, render_short


async def run_manual_pipeline(job_id: str, media_path: Path, product_name: str, emphasis_text: str) -> dict:
    script = write_shorts_script(product_name, emphasis_text)

    mp3_path = OUTPUTS_DIR / f"{job_id}.mp3"
    srt_path = OUTPUTS_DIR / f"{job_id}.srt"
    await synthesize(script, mp3_path, srt_path)

    duration_sec = get_audio_duration(mp3_path)

    out_path = OUTPUTS_DIR / f"{job_id}.mp4"
    render_short(media_path, mp3_path, srt_path, out_path, duration_sec)

    media_path.unlink(missing_ok=True)

    return {
        "job_id": job_id,
        "script": script,
        "subtitle_srt": srt_path.read_text(encoding="utf-8"),
        "video_url": f"/outputs/{job_id}.mp4",
        "duration_sec": round(duration_sec, 2),
    }
