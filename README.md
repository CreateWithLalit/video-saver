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

# Download an Instagram Reel using an exported cookies.txt file (recommended on Windows)
python downloader.py --cookies-file cookies.txt https://www.instagram.com/reel/xyz/

# Download an entire YouTube playlist
python downloader.py https://www.youtube.com/playlist?list=PLxxxxxxxx
```

### Options

| Option | Description |
|--------|-------------|
| `--quality N` | Max video height in pixels (e.g. `1080`, `720`, `480`, `360`) |
| `--audio` | Audio only, converted to MP3 at 320 kbps |
| `--cookies BROWSER` | Read cookies from a browser (`chrome`, `edge`, `firefox`) — needed for Instagram |
| `--cookies-file PATH` | Use a Netscape-format `cookies.txt` file for login cookies |

## Instagram reels: how to use cookies.txt

Browser cookie reading from Chrome can fail on Windows because of Chrome's cookie encryption. Using an exported Netscape-format `cookies.txt` file is the more reliable option.

1. Install a browser extension that exports Netscape-format cookies, such as **Get cookies.txt LOCALLY**.
2. Log in to [instagram.com](https://www.instagram.com/) in that browser.
3. Use the extension to export the cookies.
4. Save the export as `cookies.txt` in this project folder.
5. Download the reel:

   ```bash
   python downloader.py "https://www.instagram.com/reel/xyz/" --cookies-file cookies.txt
   ```

`cookies.txt` is as sensitive as your Instagram login. Never share it or commit it to Git; it is already listed in `.gitignore`. Downloading thousands of reels may get your account flagged. Firefox cookie reading (`--cookies firefox`) can also work when Chrome does not.

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

## Web App

Video Saver includes an authenticated local web interface. Downloads still run on this PC and use the same `Downloads/` folders and `archive.txt`; when using a phone, use **Save to device** to transfer the actual completed file through the app.

1. Install the backend into the existing virtual environment:

   ```powershell
   .\venv\Scripts\python.exe -m pip install -r backend\requirements.txt
   ```

2. Install the frontend packages:

   ```powershell
   cd frontend
   npm install
   cd ..
   ```

3. Start both services with `./run.ps1`, then open `http://localhost:3000`. The script prints the private-LAN URL for a phone on the same Wi-Fi network.

If Windows asks, allow Python and Node.js through Windows Firewall on **private** networks only. The FastAPI server remains loopback-only; the Next.js server proxies `/api` requests. There is no login screen, so only use the phone URL on a trusted private network. Recent-job history is intentionally in memory and resets when the backend restarts.

For Instagram metadata or downloads, the web app uses the same project-root `cookies.txt` file when present. Never share or commit it. For private remote access beyond your Wi-Fi, a tool such as Tailscale can provide a private network; it is not configured by this project.

For development, `run.ps1` runs `npm run dev`. For a production-style local frontend, run `cd frontend; npm run build; npm run start -- --hostname 0.0.0.0 --port 3000` while running the backend command printed in `run.ps1` separately.

### Web app health and troubleshooting

After startup, `http://127.0.0.1:8000/api/health` returns `{"status":"ok"}` when the backend is live. `run.ps1` checks both services before reporting success and leaves their PowerShell windows open so startup errors remain visible. Backend diagnostic logs are rotated at `backend/video-saver.log` and never include passwords, session tokens, or cookie contents.

The local app keeps completed-job history only in memory. Restarting the backend clears that history, although downloaded files remain in `Downloads/`. The phone URL is ordinary LAN HTTP and is not encrypted; use it only on a trusted private network. Do not expose the app to the public internet.
