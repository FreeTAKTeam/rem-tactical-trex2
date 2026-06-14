[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"

$NodeVersion = "20.19.5"
$Root = Split-Path -Parent $PSScriptRoot
$ToolsDirectory = Join-Path $Root ".tools"
$NodeDirectory = Join-Path $ToolsDirectory "node-v$NodeVersion-win-x64"
$NodeExecutable = Join-Path $NodeDirectory "node.exe"
$Archive = Join-Path $ToolsDirectory "node-v$NodeVersion-win-x64.zip"

if (-not (Test-Path -LiteralPath $NodeExecutable)) {
  New-Item -ItemType Directory -Path $ToolsDirectory -Force | Out-Null
  $NodeUrl = "https://nodejs.org/dist/v$NodeVersion/node-v$NodeVersion-win-x64.zip"

  Write-Host "Downloading Node.js $NodeVersion..."
  Invoke-WebRequest -Uri $NodeUrl -OutFile $Archive
  Expand-Archive -LiteralPath $Archive -DestinationPath $ToolsDirectory -Force
  Remove-Item -LiteralPath $Archive -Force
}

$NpmCli = Join-Path $NodeDirectory "node_modules\npm\bin\npm-cli.js"

Write-Host "Installing Zepp OS development dependencies..."
& $NodeExecutable $NpmCli install --no-audit --no-fund
if ($LASTEXITCODE -ne 0) {
  throw "npm install failed with exit code $LASTEXITCODE"
}

Write-Host ""
Write-Host "Environment ready."
Write-Host "Build:   .\scripts\zeus.ps1 build"
Write-Host "Develop: .\scripts\zeus.ps1 dev"
Write-Host "Device:  .\scripts\zeus.ps1 preview"

