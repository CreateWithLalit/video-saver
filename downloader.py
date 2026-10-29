#!/usr/bin/env python3
"""Personal video downloader — YouTube, Instagram, and more.

Uses yt-dlp to download videos in the highest available quality.

Usage examples:
    python downloader.py https://www.youtube.com/watch?v=dQw4w9WgXcQ
    python downloader.py URL1 URL2 URL3
    python downloader.py --quality 720 URL
    python downloader.py --audio URL
    python downloader.py --cookies chrome https://www.instagram.com/reel/xyz/
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlparse

import yt_dlp


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
ARCHIVE_FILE = PROJECT_ROOT / "archive.txt"
DOWNLOADS_DIR = PROJECT_ROOT / "Downloads"

OUTPUT_TEMPLATE = "%(title).150B [%(id)s].%(ext)s"


def detect_site(url: str) -> str:
    """Return 'YouTube', 'Instagram', or 'Other' based on the URL hostname."""
    try:
        host = urlparse(url).hostname or ""
    except Exception:
        return "Other"
    host = host.lower().removeprefix("www.")
    if host in ("youtube.com", "youtu.be", "m.youtube.com", "music.youtube.com"):
        return "YouTube"
    if host in ("instagram.com", "www.instagram.com"):
        return "Instagram"
    return "Other"


def build_format_string(max_height: int | None, audio_only: bool) -> str:
    """Build the yt-dlp format selector string."""
    if audio_only:
        return "ba/b"
    if max_height is not None:
        return f"bv*[height<={max_height}]+ba/b[height<={max_height}]"
    return "bv*+ba/b"


def build_ydl_opts(
    url: str,
    *,
    max_height: int | None,
    audio_only: bool,
    cookies_browser: str | None,
) -> dict:
    """Build the yt-dlp options dict for a single URL."""
    site = detect_site(url)
    out_dir = DOWNLOADS_DIR / site
    out_dir.mkdir(parents=True, exist_ok=True)

    opts: dict = {
        "format": build_format_string(max_height, audio_only),
        "outtmpl": {"default": str(out_dir / OUTPUT_TEMPLATE)},
        "download_archive": str(ARCHIVE_FILE),
        "retries": 5,
        "fragment_retries": 5,
        "ignoreerrors": False,
        "noplaylist": False,  # allow playlists
    }

    if audio_only:
        opts["postprocessors"] = [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "mp3",
                "preferredquality": "320",
            }
        ]
    else:
        opts["merge_output_format"] = "mp4"

    if cookies_browser:
        opts["cookiesfrombrowser"] = (cookies_browser,)

    return opts


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    """Parse command-line arguments."""
    parser = argparse.ArgumentParser(
        prog="downloader",
        description="Download videos from YouTube, Instagram, and other sites.",
        epilog=(
            "Examples:\n"
            "  python downloader.py https://www.youtube.com/watch?v=dQw4w9WgXcQ\n"
            "  python downloader.py --quality 720 URL\n"
            "  python downloader.py --audio URL\n"
            "  python downloader.py --cookies chrome https://instagram.com/reel/xyz/\n"
        ),
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument(
        "urls",
        nargs="+",
        metavar="URL",
        help="one or more video/playlist URLs to download",
    )
    parser.add_argument(
        "--quality",
        type=int,
        default=None,
        metavar="N",
        help="max video height in pixels (e.g. 1080, 720, 480, 360)",
    )
    parser.add_argument(
        "--audio",
        action="store_true",
        help="download audio only, converted to MP3 at 320 kbps",
    )
    parser.add_argument(
        "--cookies",
        type=str,
        default=None,
        metavar="BROWSER",
        help="read cookies from a browser (chrome, edge, firefox)",
    )
    return parser.parse_args(argv)


def download_url(url: str, *, args: argparse.Namespace) -> bool:
    """Download a single URL. Returns True on success, False on failure."""
    site = detect_site(url)
    opts = build_ydl_opts(
        url,
        max_height=args.quality,
        audio_only=args.audio,
        cookies_browser=args.cookies,
    )

    try:
        with yt_dlp.YoutubeDL(opts) as ydl:
            ydl.download([url])
    except yt_dlp.utils.DownloadError as exc:
        print(f"\n✗ Failed: {url}  —  {exc}", file=sys.stderr)
        if site == "Instagram":
            print(
                "  Tip: Instagram often requires login cookies. "
                "Retry with: --cookies chrome  (or edge / firefox)",
                file=sys.stderr,
            )
        return False
    except Exception as exc:
        print(f"\n✗ Unexpected error for {url}: {exc}", file=sys.stderr)
        return False

    return True


def main(argv: list[str] | None = None) -> int:
    """Entry point. Returns 0 if all downloads succeed, 1 otherwise."""
    args = parse_args(argv)

    succeeded = 0
    total = len(args.urls)

    for url in args.urls:
        site = detect_site(url)
        print(f"\n{'='*60}")
        print(f"  Downloading [{site}]: {url}")
        print(f"{'='*60}\n")
        if download_url(url, args=args):
            succeeded += 1

    print(f"\nDone: {succeeded}/{total} succeeded.")
    return 0 if succeeded == total else 1


if __name__ == "__main__":
    sys.exit(main())
