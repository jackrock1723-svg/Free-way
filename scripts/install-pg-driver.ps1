# Installs the free Postgres driver (psycopg + its self-contained binary libpq) into a side folder
# so the Free way server can use DATABASE_URL without modifying the bundled/live Python.
# Usage: .\scripts\install-pg-driver.ps1 [-Target <folder>] [-Python <python 3.12 with pip>]
param([string]$Target = (Join-Path $PSScriptRoot "..\pydeps"), [string]$Python = "py")
$ErrorActionPreference = "Stop"
$venv = Join-Path $env:TEMP ("fw-pgdriver-" + [guid]::NewGuid().ToString("N"))
if ($Python -eq "py") { & py -3.12 -m venv $venv } else { & $Python -m venv $venv }
& (Join-Path $venv "Scripts\python.exe") -m pip install --quiet --disable-pip-version-check --target $Target "psycopg[binary]"
Remove-Item -Recurse -Force $venv
Write-Host "Postgres driver installed to $Target (set FW_PYDEPS if you use another folder)."
