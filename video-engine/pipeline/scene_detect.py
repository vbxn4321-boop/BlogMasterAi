import subprocess
from pathlib import Path

from scenedetect import ContentDetector, SceneManager, open_video


def detect_scenes(video_path: Path, thumbnails_dir: Path, job_id: str) -> list[dict]:
    video = open_video(str(video_path))
    scene_manager = SceneManager()
    scene_manager.add_detector(ContentDetector(threshold=27.0))
    scene_manager.detect_scenes(video)
    scene_list = scene_manager.get_scene_list()

    if not scene_list:
        scene_list = [(video.base_timecode, video.duration)]

    scenes = []
    for i, (start, end) in enumerate(scene_list):
        start_sec = start.get_seconds()
        end_sec = end.get_seconds()
        thumb_path = thumbnails_dir / f"{job_id}_scene{i}.jpg"
        _extract_thumbnail(video_path, start_sec, thumb_path)
        scenes.append({
            "index": i,
            "start": round(start_sec, 2),
            "end": round(end_sec, 2),
            "thumbnail_path": f"/outputs/{thumb_path.name}",
        })
    return scenes


def _extract_thumbnail(video_path: Path, timestamp_sec: float, out_path: Path) -> None:
    subprocess.run(
        [
            "ffmpeg", "-y",
            "-ss", str(timestamp_sec),
            "-i", str(video_path),
            "-frames:v", "1",
            "-q:v", "3",
            str(out_path),
        ],
        capture_output=True, text=True, check=True,
    )
