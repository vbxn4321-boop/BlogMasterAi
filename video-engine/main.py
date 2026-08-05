import uuid
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from config import ALLOWED_ORIGIN, UPLOADS_DIR, OUTPUTS_DIR
from pipeline.job import run_manual_pipeline
from pipeline.xhs_job import run_xhs_pipeline

app = FastAPI(title="Shorts Video Engine")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[ALLOWED_ORIGIN],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/outputs", StaticFiles(directory=OUTPUTS_DIR), name="outputs")

ALLOWED_CONTENT_TYPES = {"image/png", "image/jpeg", "video/mp4"}


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/api/shorts/manual")
async def create_manual_short(
    media: UploadFile = File(...),
    product_name: str = Form(...),
    emphasis_text: str = Form(...),
):
    if media.content_type not in ALLOWED_CONTENT_TYPES:
        raise HTTPException(status_code=400, detail=f"지원하지 않는 파일 형식입니다: {media.content_type}")

    job_id = uuid.uuid4().hex
    suffix = Path(media.filename or "").suffix or ".bin"
    media_path = UPLOADS_DIR / f"{job_id}{suffix}"

    with open(media_path, "wb") as f:
        f.write(await media.read())

    try:
        result = await run_manual_pipeline(job_id, media_path, product_name, emphasis_text)
    except Exception as exc:
        media_path.unlink(missing_ok=True)
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return result


class XhsProcessRequest(BaseModel):
    job_id: str
    video_url: str
    image_urls: list[str] = []
    caption_text: str = ""
    callback_url: str
    engine_secret: str


@app.post("/api/xhs/process")
async def process_xhs_job(req: XhsProcessRequest, background_tasks: BackgroundTasks):
    background_tasks.add_task(
        run_xhs_pipeline, req.job_id, req.video_url, req.caption_text, req.callback_url, req.engine_secret
    )
    return {"status": "accepted"}
