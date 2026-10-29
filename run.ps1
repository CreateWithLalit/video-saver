$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$python = Join-Path $projectRoot "venv\Scripts\python.exe"
$frontend = Join-Path $projectRoot "frontend"

if (-not (Test-Path -LiteralPath $python)) { throw "Existing virtual environment Python was not found: $python" }
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot "backend\.env"))) { throw "Missing backend\.env. Copy backend\.env.example to backend\.env and set APP_PASSWORD." }
if (-not (Test-Path -LiteralPath (Join-Path $frontend "node_modules"))) { throw "Frontend packages are missing. Run: cd `"$frontend`"; npm install" }

$lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress

Write-Host "Video Saver`n"
Write-Host "Local URL: http://localhost:3000"
Write-Host "Backend:   http://127.0.0.1:8000"
if ($lanIp) { Write-Host "`nOpen on your phone:`nhttp://${lanIp}:3000" } else { Write-Warning "No private LAN IPv4 address was detected." }

Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location -LiteralPath '$projectRoot'; & '$python' -m uvicorn backend.app:app --host 127.0.0.1 --port 8000"
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location -LiteralPath '$frontend'; npm run dev -- --hostname 0.0.0.0 --port 3000"
