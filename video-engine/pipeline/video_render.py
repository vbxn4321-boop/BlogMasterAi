import subprocess
from pathlib import Path

VIDEO_EXTENSIONS = {".mp4", ".mov", ".webm", ".m4v"}


def is_video_file(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS


def get_audio_duration(audio_path: Path) -> float:
    result = subprocess.run(
        [
            "ffprobe", "-v", "error",
            "-show_entries", "format=duration",
            "-of", "default=noprint_wrappers=1:nokey=1",
            str(audio_path),
        ],
        capture_output=True, text=True, check=True,
    )
    return float(result.stdout.strip())


def _escape_for_filter(path: Path) -> str:
    return str(path.resolve()).replace("\\", "/").replace(":", "\\:")


def render_short(media_path: Path, audio_path: Path, srt_path: Path, out_path: Path, duration_sec: float) -> None:
    escaped_srt = _escape_for_filter(srt_path)
    subtitle_style = (
        "FontName=Malgun Gothic,FontSize=22,PrimaryColour=&H00FFFFFF,"
        "OutlineColour=&H00000000,BorderStyle=3,Outline=2,MarginV=160"
    )
    vf = (
        f"scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,"
        f"subtitles='{escaped_srt}':force_style='{subtitle_style}'"
    )

    loop_args = ["-stream_loop", "-1"] if is_video_file(media_path) else ["-loop", "1"]

    cmd = [
        "ffmpeg", "-y",
        *loop_args, "-i", str(media_path),
        "-i", str(audio_path),
        "-filter:v", vf,
        "-map", "0:v", "-map", "1:a",
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-c:a", "aac",
        "-t", str(duration_sec),
        str(out_path),
    ]
    subprocess.run(cmd, capture_output=True, text=True, check=True)
