"""Authenticated local web API for the existing Video Saver downloader."""

from __future__ import annotations

import asyncio
import hmac
import json
import mimetypes
import os
import secrets
import sys
import threading
import time
import uuid
from collections import defaultdict, deque
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Iterator
from urllib.parse import quote, urlparse

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse
from pydantic import BaseModel, Field

PROJECT_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(PROJECT_ROOT))
from downloader import (  # noqa: E402
    ARCHIVE_FILE,
    DOWNLOADS_DIR,
    OUTPUT_TEMPLATE,
    build_format_string,
    detect_site,
)
import yt_dlp  # noqa: E402

ENV_FILE = Path(__file__).with_name(".env")
ALLOWED_HOSTS = {
    "youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com",
    "youtu.be", "instagram.com", "www.instagram.com",
}
QUALITY_VALUES = {"best", "1080", "720", "480", "360"}
SESSION_SECONDS = 12 * 60 * 60
COOKIE_NAME = "video_saver_session"


def load_env() -> dict[str, str]:
    """Read the small local .env file without a third-party dependency."""
    values = dict(os.environ)
    if ENV_FILE.is_file():
        for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
            if line and not line.lstrip().startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                values.setdefault(key.strip(), value.strip())
    return values


CONFIG = load_env()
APP_PASSWORD = CONFIG.get("APP_PASSWORD", "")
if not APP_PASSWORD or APP_PASSWORD == "replace-with-a-strong-password":
    raise RuntimeError(
        "APP_PASSWORD is missing. Copy backend/.env.example to backend/.env and set it."
    )
COOKIE_SECURE = CONFIG.get("SESSION_COOKIE_SECURE", "false").lower() == "true"


def now() -> str:
    return datetime.now(UTC).isoformat()


def validate_url(url: str) -> str:
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise HTTPException(400, "Enter a complete http or https YouTube or Instagram URL.")
    if parsed.hostname.lower() not in ALLOWED_HOSTS:
        raise HTTPException(400, "Only YouTube and Instagram URLs are allowed in the web app.")
    return url


@dataclass
class Job:
    id: str
    url: str
    quality: str
    audio_only: bool
    title: str = "Preparing download"
    site: str = "Other"
    status: str = "queued"
    created_at: str = field(default_factory=now)
    updated_at: str = field(default_factory=now)
    progress: dict[str, Any] = field(default_factory=lambda: progress_payload("queued", 0, "Queued"))
    error: str | None = None
    output_path: Path | None = None


def progress_payload(stage: str, percent: float, message: str, **metrics: Any) -> dict[str, Any]:
    return {
        "stage": stage, "percent": round(percent, 1), "speed": metrics.get("speed"),
        "eta": metrics.get("eta"), "downloaded_bytes": metrics.get("downloaded_bytes"),
        "total_bytes": metrics.get("total_bytes"), "message": message,
    }


jobs: dict[str, Job] = {}
jobs_lock = threading.RLock()
executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="video-saver")
sessions: dict[str, float] = {}
sessions_lock = threading.Lock()
login_attempts: dict[str, deque[float]] = defaultdict(deque)
login_lock = threading.Lock()


def client_ip(request: Request) -> str:
    # The backend is bound to loopback behind the Next.js rewrite. Forwarded headers
    # are deliberately ignored because arbitrary clients can forge them.
    return request.client.host if request.client else "unknown"


def require_session(session: str | None = Cookie(default=None, alias=COOKIE_NAME)) -> str:
    if not session:
        raise HTTPException(401, "Sign in to continue.")
    with sessions_lock:
        expiry = sessions.get(session)
        if expiry is None or expiry <= time.time():
            sessions.pop(session, None)
            raise HTTPException(401, "Your session has expired. Sign in again.")
    return session


class LoginRequest(BaseModel):
    password: str = Field(min_length=1, max_length=1024)


class InfoRequest(BaseModel):
    url: str


class JobRequest(BaseModel):
    url: str
    quality: str = "best"
    audio_only: bool = False


def cookie_option() -> Path | None:
    candidate = PROJECT_ROOT / "cookies.txt"
    return candidate if candidate.is_file() else None


def metadata_options() -> dict[str, Any]:
    options: dict[str, Any] = {"quiet": True, "no_warnings": True, "noplaylist": True}
    if (cookie_file := cookie_option()) is not None:
        options["cookiefile"] = str(cookie_file)
    return options


def friendly_error(error: Exception) -> str:
    message = str(error)
    lowered = message.lower()
    if "empty media response" in lowered or "login" in lowered or "cookie" in lowered:
        return "This content may require a logged-in session. Export Instagram cookies.txt and try again."
    if "ffmpeg" in lowered:
        return "FFmpeg failed or is unavailable. Confirm ffmpeg is installed and on PATH."
    if "private" in lowered or "unavailable" in lowered:
        return "This video is private, unavailable, or cannot be accessed."
    return message[:500] or "The download failed unexpectedly."


def update_job(job_id: str, stage: str, percent: float, message: str, **metrics: Any) -> None:
    with jobs_lock:
        job = jobs[job_id]
        old_percent = float(job.progress.get("percent") or 0)
        job.progress = progress_payload(stage, max(old_percent, min(percent, 99)), message, **metrics)
        job.status = stage
        job.updated_at = now()


def download_worker(job_id: str) -> None:
    with jobs_lock:
        job = jobs[job_id]
        job.site = detect_site(job.url)
    update_job(job_id, "fetching", 1, "Fetching video information")
    site_dir = DOWNLOADS_DIR / jobs[job_id].site
    before = {path.resolve() for path in site_dir.glob("*")} if site_dir.exists() else set()
    stream_progress = 0.0

    def hook(data: dict[str, Any]) -> None:
        nonlocal stream_progress
        status = data.get("status")
        if status == "downloading":
            downloaded = data.get("downloaded_bytes")
            total = data.get("total_bytes") or data.get("total_bytes_estimate")
            raw = (downloaded / total * 100) if downloaded is not None and total else 0
            # Multiple streams are mapped into a monotonically increasing 0–95% span.
            mapped = min(95.0, max(stream_progress, raw * 0.85))
            stream_progress = mapped
            update_job(job_id, "downloading", mapped, "Downloading media", speed=data.get("speed"),
                       eta=data.get("eta"), downloaded_bytes=downloaded, total_bytes=total)
        elif status == "finished":
            stream_progress = max(stream_progress, 95.0)
            update_job(job_id, "merging", 95, "Download complete; processing media")

    def postprocessor_hook(data: dict[str, Any]) -> None:
        if data.get("status") == "started":
            update_job(job_id, "merging", 97, "Merging or converting media")

    try:
        with jobs_lock:
            job = jobs[job_id]
            maximum = None if job.quality == "best" else int(job.quality)
            job.title = "Downloading"
        options: dict[str, Any] = {
            "format": build_format_string(maximum, job.audio_only),
            "outtmpl": {"default": str(site_dir / OUTPUT_TEMPLATE)},
            "download_archive": str(ARCHIVE_FILE), "retries": 5, "fragment_retries": 5,
            "ignoreerrors": False, "noplaylist": False, "progress_hooks": [hook],
            "postprocessor_hooks": [postprocessor_hook], "merge_output_format": "mp4",
        }
        if job.audio_only:
            options["postprocessors"] = [{"key": "FFmpegExtractAudio", "preferredcodec": "mp3", "preferredquality": "320"}]
        if (cookie_file := cookie_option()) is not None:
            options["cookiefile"] = str(cookie_file)
        with yt_dlp.YoutubeDL(options) as ydl:
            info = ydl.extract_info(job.url, download=True)
            with jobs_lock:
                jobs[job_id].title = info.get("title") or jobs[job_id].title
        created = [path for path in site_dir.glob("*") if path.is_file() and path.resolve() not in before]
        if not created:
            raise RuntimeError("No new output file was created (it may already be in the download archive).")
        output = max(created, key=lambda path: path.stat().st_mtime).resolve()
        with jobs_lock:
            job = jobs[job_id]
            job.output_path = output
            job.status = "done"
            job.progress = progress_payload("done", 100, "Download complete")
            job.updated_at = now()
    except Exception as exc:
        with jobs_lock:
            job = jobs[job_id]
            job.status = "error"
            job.error = friendly_error(exc)
            job.progress = progress_payload("error", float(job.progress.get("percent") or 0), job.error)
            job.updated_at = now()


app = FastAPI(title="Video Saver", docs_url=None, redoc_url=None)


@app.post("/api/login")
def login(payload: LoginRequest, request: Request, response: Response) -> dict[str, bool]:
    ip = client_ip(request)
    current = time.time()
    with login_lock:
        attempts = login_attempts[ip]
        while attempts and attempts[0] <= current - 60:
            attempts.popleft()
        if len(attempts) >= 5:
            raise HTTPException(429, "Too many failed attempts. Try again in a minute.")
        if not hmac.compare_digest(payload.password, APP_PASSWORD):
            attempts.append(current)
            raise HTTPException(401, "Incorrect password.")
        attempts.clear()
    token = secrets.token_urlsafe(32)
    with sessions_lock:
        sessions[token] = current + SESSION_SECONDS
    response.set_cookie(COOKIE_NAME, token, httponly=True, samesite="lax", secure=COOKIE_SECURE,
                        max_age=SESSION_SECONDS, path="/")
    return {"ok": True}


@app.post("/api/logout")
def logout(response: Response, session: str = Depends(require_session)) -> dict[str, bool]:
    with sessions_lock:
        sessions.pop(session, None)
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/me")
def me(_: str = Depends(require_session)) -> dict[str, bool]:
    return {"authenticated": True}


@app.post("/api/info")
def info(payload: InfoRequest, _: str = Depends(require_session)) -> dict[str, Any]:
    url = validate_url(payload.url)
    try:
        with yt_dlp.YoutubeDL(metadata_options()) as ydl:
            data = ydl.extract_info(url, download=False)
    except Exception as exc:
        raise HTTPException(400, friendly_error(exc)) from exc
    heights = sorted({fmt.get("height") for fmt in data.get("formats", []) if isinstance(fmt.get("height"), int)}, reverse=True)
    return {"title": data.get("title") or "Untitled video", "thumbnail": data.get("thumbnail"),
            "duration": data.get("duration"), "uploader": data.get("uploader") or data.get("channel"),
            "site": detect_site(url), "available_heights": heights}


@app.post("/api/jobs")
def create_job(payload: JobRequest, _: str = Depends(require_session)) -> dict[str, str]:
    url = validate_url(payload.url)
    if payload.quality not in QUALITY_VALUES:
        raise HTTPException(400, "Quality must be best, 1080, 720, 480, or 360.")
    job = Job(id=uuid.uuid4().hex, url=url, quality=payload.quality, audio_only=payload.audio_only, site=detect_site(url))
    with jobs_lock:
        jobs[job.id] = job
    executor.submit(download_worker, job.id)
    return {"job_id": job.id}


@app.get("/api/jobs")
def list_jobs(_: str = Depends(require_session)) -> list[dict[str, Any]]:
    with jobs_lock:
        recent = sorted(jobs.values(), key=lambda item: item.created_at, reverse=True)[:20]
        return [{"id": item.id, "title": item.title, "site": item.site, "status": item.status,
                 "created_at": item.created_at, "error": item.error, "has_file": bool(item.output_path and item.output_path.is_file())}
                for item in recent]


@app.get("/api/jobs/{job_id}/events")
async def events(job_id: str, _: str = Depends(require_session)) -> StreamingResponse:
    if job_id not in jobs:
        raise HTTPException(404, "Job not found.")
    async def stream() -> Any:
        while True:
            with jobs_lock:
                job = jobs.get(job_id)
                if job is None:
                    return
                event = dict(job.progress)
                terminal = job.status in {"done", "error"}
            yield f"data: {json.dumps(event)}\n\n"
            if terminal:
                return
            # A frequent state snapshot gives the UI responsive genuine progress;
            # every response also acts as a valid SSE heartbeat.
            await asyncio.sleep(1)
    return StreamingResponse(stream(), media_type="text/event-stream", headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})


@app.get("/api/jobs/{job_id}/file")
def file(job_id: str, _: str = Depends(require_session)) -> FileResponse:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, "Job not found.")
        if job.status != "done" or not job.output_path:
            raise HTTPException(409, "The download is not complete.")
        path = job.output_path.resolve()
    if DOWNLOADS_DIR.resolve() not in path.parents or not path.is_file():
        raise HTTPException(404, "The completed file is no longer available.")
    ascii_name = "".join(char if ord(char) < 128 and char not in '\\"' else "_" for char in path.name)
    disposition = f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(path.name)}"
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    return FileResponse(path, media_type=media_type, headers={"Content-Disposition": disposition, "Accept-Ranges": "bytes"})
