from pathlib import Path

import httpx

from config import OUTPUTS_DIR
from pipeline.product_vision import guess_product_name
from pipeline.scene_detect import detect_scenes
from pipeline.script_writer import rewrite_xhs_script
from pipeline.transcribe import transcribe


async def run_xhs_pipeline(job_id: str, video_url: str, caption_text: str, callback_url: str, engine_secret: str) -> None:
    try:
        video_path = OUTPUTS_DIR / f"{job_id}_source.mp4"
        await _download_file(video_url, video_path)

        scenes = detect_scenes(video_path, OUTPUTS_DIR, job_id)

        stt_text = ""
        try:
            stt_text = transcribe(video_path)
        except Exception as e:
            print(f"[XHS] Whisper STT skipped: {e}")

        translated_script = rewrite_xhs_script(caption_text, stt_text)

        product_name_guess = "알 수 없음"
        if scenes:
            mid_scene = scenes[len(scenes) // 2]
            thumb_path = OUTPUTS_DIR / Path(mid_scene["thumbnail_path"]).name
            if thumb_path.exists():
                product_name_guess = guess_product_name(thumb_path)

        payload = {
            "scenes": scenes,
            "translated_script": translated_script,
            "product_name_guess": product_name_guess,
        }
    except Exception as e:
        payload = {"error": str(e)}

    await _post_callback(callback_url, engine_secret, payload)


async def _download_file(url: str, dest: Path) -> None:
    async with httpx.AsyncClient(timeout=120, follow_redirects=True) as client:
        resp = await client.get(url)
        resp.raise_for_status()
        dest.write_bytes(resp.content)


async def _post_callback(url: str, engine_secret: str, payload: dict) -> None:
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            await client.post(url, json=payload, headers={"x-engine-secret": engine_secret})
    except Exception as e:
        print(f"[XHS] Callback failed: {e}")
