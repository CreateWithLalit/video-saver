# Video Downloader

A personal video downloader using **yt-dlp** and **ffmpeg** that saves YouTube videos and Instagram Reels in the highest available quality to local storage.

## Requirements

- Python 3.10+
- ffmpeg (installed via winget/choco on Windows, brew on macOS, apt on Linux)
- Deno (JavaScript runtime required by yt-dlp for YouTube — install with `winget install DenoLand.Deno`)
- yt-dlp (installed via requirements.txt)

## Setup

```bash
# 1. Create and activate the virtual environment
python -m venv venv
.\venv\Scripts\Activate.ps1      # Windows PowerShell
# source venv/bin/activate        # macOS / Linux

# 2. Install dependencies
pip install -r requirements.txt
```

## Usage

```bash
# Download a YouTube video in best quality (MP4)
python downloader.py https://www.youtube.com/watch?v=dQw4w9WgXcQ

# Download multiple URLs at once
python downloader.py URL1 URL2 URL3

# Download at a specific max resolution (e.g. 720p, 480p, 360p)
python downloader.py --quality 720 URL

# Download audio only as MP3 (320 kbps)
python downloader.py --audio URL

# Download an Instagram Reel (requires browser cookies for login)
python downloader.py --cookies chrome https://www.instagram.com/reel/xyz/

# Download an entire YouTube playlist
python downloader.py https://www.youtube.com/playlist?list=PLxxxxxxxx
```

### Options

| Option | Description |
|--------|-------------|
| `--quality N` | Max video height in pixels (e.g. `1080`, `720`, `480`, `360`) |
| `--audio` | Audio only, converted to MP3 at 320 kbps |
| `--cookies BROWSER` | Read cookies from a browser (`chrome`, `edge`, `firefox`) — needed for Instagram |

### Where files are saved

| Site | Folder |
|------|--------|
| YouTube | `Downloads/YouTube/` |
| Instagram | `Downloads/Instagram/` |
| Other sites | `Downloads/Other/` |

### Download archive

The file `archive.txt` tracks every downloaded video ID. Running the same URL again will skip it automatically. Delete `archive.txt` to re-download everything.

## Update yt-dlp

yt-dlp is updated frequently to keep up with site changes. Update it with:

```bash
pip install --upgrade yt-dlp
```
