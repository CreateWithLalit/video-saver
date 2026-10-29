$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$python = Join-Path $projectRoot "venv\Scripts\python.exe"
$frontend = Join-Path $projectRoot "frontend"
$backendApp = Join-Path $projectRoot "backend\app.py"
$frontendPackage = Join-Path $frontend "package.json"
$frontendModules = Join-Path $frontend "node_modules"

if (-not (Test-Path -LiteralPath $python)) { throw "Existing virtual environment Python was not found: $python" }
if (-not (Test-Path -LiteralPath $backendApp)) { throw "Backend application was not found: $backendApp" }
if (-not (Test-Path -LiteralPath $frontendPackage)) { throw "Frontend package.json was not found: $frontendPackage" }
if (-not (Get-Command npm -ErrorAction SilentlyContinue)) { throw "npm was not found. Install Node.js LTS, then retry." }
if (-not (Test-Path -LiteralPath $frontendModules)) {
    Write-Host "Installing missing frontend dependencies..."
    Push-Location $frontend
    try { npm install } finally { Pop-Location }
}

foreach ($port in 8000, 3000) {
    $listener = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($listener) {
        $process = Get-Process -Id $listener.OwningProcess -ErrorAction SilentlyContinue
        $name = if ($process) { $process.ProcessName } else { "PID $($listener.OwningProcess)" }
        throw "Port $port is already in use by $name (PID $($listener.OwningProcess)). Stop that process or choose another port."
    }
}

$lanIp = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" -and $_.PrefixOrigin -ne "WellKnown" } |
    Select-Object -First 1 -ExpandProperty IPAddress

$backendProcess = Start-Process powershell -PassThru -ArgumentList "-NoExit", "-Command", "Set-Location -LiteralPath '$projectRoot'; & '$python' -m uvicorn backend.app:app --host 127.0.0.1 --port 8000"
$frontendProcess = Start-Process powershell -PassThru -ArgumentList "-NoExit", "-Command", "Set-Location -LiteralPath '$frontend'; npm run dev -- --hostname 0.0.0.0 --port 3000"

$deadline = (Get-Date).AddSeconds(45)
$backendReady = $false
$frontendReady = $false
while ((Get-Date) -lt $deadline -and -not ($backendReady -and $frontendReady)) {
    if ($backendProcess.HasExited) { throw "Backend PowerShell exited during startup. Review its terminal output." }
    if ($frontendProcess.HasExited) { throw "Frontend PowerShell exited during startup. Review its terminal output." }
    try { $backendReady = (Invoke-WebRequest 'http://127.0.0.1:8000/api/health' -TimeoutSec 2).StatusCode -eq 200 } catch { }
    try { $frontendReady = (Invoke-WebRequest 'http://localhost:3000' -TimeoutSec 2).StatusCode -eq 200 } catch { }
    if (-not ($backendReady -and $frontendReady)) { Start-Sleep -Milliseconds 500 }
}
if (-not $backendReady) { throw "Backend did not become ready within 45 seconds. Review the backend terminal output." }
if (-not $frontendReady) { throw "Frontend did not become ready within 45 seconds. Review the frontend terminal output." }

Write-Host "Video Saver`n"
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend:  http://127.0.0.1:8000"
if ($lanIp) { Write-Host "Phone:    http://${lanIp}:3000" } else { Write-Warning "No private LAN IPv4 address was detected." }
