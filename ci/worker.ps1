param([ValidateSet('serve','once','status','pause','resume')][string]$Action='serve')
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$runtime=Get-Content (Join-Path $root 'output/worker/runtime.json') -Raw | ConvertFrom-Json
$credential=Import-Clixml -LiteralPath (Join-Path $env:USERPROFILE '.codex/secrets/menusifu-jenkins.credential.xml')
try {
  $env:SUITE_JENKINS_USER=$credential.UserName
  $env:SUITE_JENKINS_TOKEN=$credential.GetNetworkCredential().Password
  Set-Location -LiteralPath $root
  & $runtime.python (Join-Path $PSScriptRoot 'worker.py') $Action
  exit $LASTEXITCODE
} finally {
  Remove-Item Env:SUITE_JENKINS_USER,Env:SUITE_JENKINS_TOKEN -ErrorAction SilentlyContinue
}
