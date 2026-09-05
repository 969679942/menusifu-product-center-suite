param([Parameter(ValueFromRemainingArguments=$true)][string[]]$Arguments)
$ErrorActionPreference='Stop'
$credential=Import-Clixml -LiteralPath (Join-Path $env:USERPROFILE '.codex\secrets\menusifu-jenkins.credential.xml')
try {
  $env:SUITE_JENKINS_USER=$credential.UserName
  $env:SUITE_JENKINS_TOKEN=$credential.GetNetworkCredential().Password
  python (Join-Path $PSScriptRoot 'jenkins.py') @Arguments
  $code=$LASTEXITCODE
} finally {
  Remove-Item Env:SUITE_JENKINS_USER,Env:SUITE_JENKINS_TOKEN -ErrorAction SilentlyContinue
}
exit $code
