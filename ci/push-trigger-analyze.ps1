param([ValidateSet('contracts','pilot','full-regression')][string]$Scope='pilot',[int]$TimeoutSeconds=1800)
$ErrorActionPreference='Stop'
& (Join-Path $PSScriptRoot 'jenkins.ps1') submit --scope $Scope
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
$deadline=(Get-Date).AddSeconds($TimeoutSeconds)
do {
  & (Join-Path $PSScriptRoot 'jenkins.ps1') poll
  if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
  $state=Get-Content (Join-Path $PSScriptRoot '../output/jenkins/checkpoint.json') -Raw | ConvertFrom-Json
  if($state.status -eq 'analyzed'){
    $result=Get-Content $state.analysisPath -Raw | ConvertFrom-Json
    if($result.identityVerified -and $result.executionComplete -and $result.jenkinsResult -eq 'SUCCESS' -and ($Scope -eq 'contracts' -or $result.businessPassAuthority)){exit 0}
    exit 1
  }
  Start-Sleep -Seconds 10
} while((Get-Date) -lt $deadline)
throw 'Polling timed out; checkpoint retained. Resume with ci/jenkins.ps1 poll.'
