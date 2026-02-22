param(
  [int]$Port = 8080
)

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $scriptDir

$url = "http://localhost:$Port"
Write-Host "Serving Card Counter Blackjack from: $scriptDir"
Write-Host "Open: $url"
Write-Host "Press Ctrl+C to stop."

function Start-WithPython {
  param([string]$ExePath)
  & $ExePath --version *> $null
  if ($LASTEXITCODE -ne 0) { return $false }
  & $ExePath -m http.server $Port --bind 127.0.0.1
  exit $LASTEXITCODE
}

$pythonCandidates = @()
$localPy = Join-Path $env:LOCALAPPDATA "Programs\Python"
if (Test-Path $localPy) {
  $pythonCandidates += Get-ChildItem -Path $localPy -Filter python.exe -Recurse -ErrorAction SilentlyContinue | Select-Object -ExpandProperty FullName
}

$cmdPython = Get-Command python -ErrorAction SilentlyContinue
if ($cmdPython) {
  $pythonCandidates += $cmdPython.Source
}

$pythonCandidates = $pythonCandidates | Where-Object { $_ } | Select-Object -Unique
foreach ($candidate in $pythonCandidates) {
  if (Start-WithPython -ExePath $candidate) { return }
}

$pyCmd = Get-Command py -ErrorAction SilentlyContinue
if ($pyCmd) {
  & $pyCmd.Source --version *> $null
  if ($LASTEXITCODE -eq 0) {
    & $pyCmd.Source -m http.server $Port --bind 127.0.0.1
    exit $LASTEXITCODE
  }
}

if (Get-Command npx -ErrorAction SilentlyContinue) {
  npx --yes http-server . -p $Port -a 127.0.0.1 -c-1
  exit $LASTEXITCODE
}

Write-Error "No supported runtime found. Install Python or Node.js (npx) to run a local web server."
