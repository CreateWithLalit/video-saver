# Safe Git Sync & Vercel Deployment Plan for Video Saver

This plan provides the exact, non-destructive steps to safely verify, audit, and push your working local Video Saver repository (`D:\video saver\download\video-downloader`) to GitHub (`https://github.com/CreateWithLalit/video-saver`) on branch `main`, followed by configuration for deploying the Next.js frontend to Vercel.

---

## 1. Safety Principles & Architecture Guardrails

- **Zero Data Loss**: No `git reset --hard`, `git clean -fd`, or force-pushes (`git push -f`).
- **Real Code Preservation**: Keep your genuine `downloader.py` (`yt-dlp` + `ffmpeg`), `backend/app.py`, `frontend/` (Next.js), `run.ps1`, and requirements files intact.
- **Privacy & Secret Protection**: Strict exclusion of `cookies.txt`, `backend/.env`, `Downloads/`, `archive.txt`, `venv/`, and `node_modules/`.
- **Target Deployment Architecture**:
  - **Frontend**: Next.js deployed on Vercel with Root Directory set to `frontend`.
  - **Backend**: FastAPI + `yt-dlp` running locally (or deployed on Render/Railway) to provide long-running video downloads without Vercel's serverless timeouts.

---

## 2. Step-by-Step Execution Plan

### Step 1: Open PowerShell and Inspect Working Repository State
Execute these diagnostic commands in Windows PowerShell to inspect the local Git state before modifying anything:

```powershell
# Navigate to your local project directory
Set-Location -LiteralPath "D:\video saver\download\video-downloader"

# Verify current branch and working tree status
git status
git branch --show-current
git remote -v
git log -5 --oneline

# Fetch the latest remote tracking refs without altering your local working files
git fetch origin
git log HEAD..origin/main --oneline
git log origin/main..HEAD --oneline
```

### Step 2: Source File & Implementation Verification
Ensure the working code is present and has not been altered:

```powershell
# Verify essential source files exist
Test-Path "downloader.py", "backend\app.py", "frontend\package.json", "run.ps1", "requirements.txt"

# Confirm real yt-dlp implementation is present in downloader.py
Select-String -Path "downloader.py" -Pattern "yt_dlp" -SimpleMatch | Select-Object -First 3
```

### Step 3: Secrets & Sensitive Files Audit
Inspect `.gitignore` and ensure sensitive and generated files are completely excluded:

```powershell
# Check tracked files against forbidden items
git ls-files -- "cookies.txt" "backend/.env" "archive.txt" "Downloads" "venv" "node_modules" "frontend/node_modules"

# Ensure .gitignore has all necessary exclusions:
# cookies.txt, backend/.env, venv/, Downloads/, archive.txt, node_modules/, .next/
```
*Note: If any sensitive file was previously tracked by accident, untrack it safely with `git rm --cached <file>` without deleting it from disk.*

### Step 4: Staging Only Intended Files
Stage only clean project source files:

```powershell
# Stage essential project source files
git add downloader.py backend/ frontend/ requirements.txt run.ps1 README.md .gitignore

# Inspect staged changes and verify no unwanted files are included
git status
git diff --cached --stat
```

### Step 5: Commit and Push Safely
Commit and synchronize with GitHub:

```powershell
# Commit with a clear, descriptive message
git commit -m "Prepare Video Saver for Vercel deployment"

# Push to the main branch
git push origin main

# Verify local branch matches origin/main
git status
git log -1 --stat
```

---

## 3. Vercel Deployment Configuration

Once pushed to GitHub, configure Vercel so it builds the Next.js frontend correctly:

1. In the **Vercel Dashboard**, open project **`video-saver`** &rarr; **Settings** &rarr; **General**.
2. Set **Root Directory** to: `frontend`.
3. Set **Framework Preset** to: `Next.js`.
4. Under **Environment Variables**, set:
   - `NEXT_PUBLIC_API_URL` to your backend URL (e.g. `http://127.0.0.1:8000` for local access, or your Render backend URL).
5. Trigger **Redeploy** on the `main` branch.

---

## 4. Verification & Final Checklist
- [ ] Working tree clean, zero uncommitted changes to real code.
- [ ] No secrets (`cookies.txt`, `.env`) committed or pushed.
- [ ] Commit verified on `origin/main`.
- [ ] Vercel builds `frontend/` cleanly without looking for root Python entrypoints.
