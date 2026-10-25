$ErrorActionPreference = 'Stop'
$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot
try {
    $python = $env:FC_PYTHON_EXE
    if (-not $python) {
        $command = Get-Command python.exe -ErrorAction SilentlyContinue
        if ($command) { $python = $command.Source }
    }
    if (-not $python) {
        throw 'Set FC_PYTHON_EXE to an installed Python 3.12+ executable.'
    }

    & npm.cmd run build
    if ($LASTEXITCODE -ne 0) { throw "React build failed with exit code $LASTEXITCODE" }

    & $python -m unittest discover -s (Join-Path $repoRoot 'tests\python') -v
    if ($LASTEXITCODE -ne 0) { throw "Python tests failed with exit code $LASTEXITCODE" }

    $unitTests = Get-ChildItem -LiteralPath (Join-Path $repoRoot 'tests\unit') -Filter '*.test.js' -File -ErrorAction SilentlyContinue
    if ($unitTests) {
        & npm.cmd run test:unit
        if ($LASTEXITCODE -ne 0) { throw "Node unit tests failed with exit code $LASTEXITCODE" }
    }

    $chrome = $env:FC_CHROME_PATH
    if (-not $chrome) {
        foreach ($candidate in @(
            'C:\Program Files\Google\Chrome\Application\chrome.exe',
            'C:\Program Files (x86)\Google\Chrome\Application\chrome.exe'
        )) {
            if (Test-Path -LiteralPath $candidate) { $chrome = $candidate; break }
        }
    }
    if ($chrome) { $env:FC_CHROME_PATH = $chrome }
    $env:FC_PYTHON_EXE = $python
    $env:FC_GOOGLE_AUTH = 'off'
    $env:FC_MCP = '0'
    $env:FC_ADS = 'off'
    $env:PYTHONDONTWRITEBYTECODE = '1'

    & npm.cmd run test:e2e
    if ($LASTEXITCODE -ne 0) { throw "Playwright E2E tests failed with exit code $LASTEXITCODE" }
} finally {
    Pop-Location
}
