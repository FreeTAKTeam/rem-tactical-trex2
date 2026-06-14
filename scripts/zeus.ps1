[CmdletBinding()]
param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]] $ZeusArguments
)

$ErrorActionPreference = "Stop"

$NodeVersion = "20.19.5"
$Root = Split-Path -Parent $PSScriptRoot
$NodeExecutable = Join-Path $Root ".tools\node-v$NodeVersion-win-x64\node.exe"
$ZeusLauncher = Join-Path $PSScriptRoot "run-zeus.cjs"
$ZeusCli = Join-Path $Root "node_modules\@zeppos\zeus-cli\bin\main.js"

if (-not (Test-Path -LiteralPath $NodeExecutable) -or
    -not (Test-Path -LiteralPath $ZeusCli)) {
  throw "Development tools are missing. Run .\scripts\setup.ps1 first."
}

Push-Location $Root
try {
  & $NodeExecutable $ZeusLauncher @ZeusArguments
  exit $LASTEXITCODE
}
finally {
  Pop-Location
}
