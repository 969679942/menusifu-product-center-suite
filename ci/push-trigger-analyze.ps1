#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$JenkinsUrl,[Parameter(Mandatory=$true)][string]$JobName,[Parameter(Mandatory=$true)][string]$User,[Parameter(Mandatory=$true)][string]$Token,[int]$TimeoutSeconds=900)
$ErrorActionPreference="Stop"
git push
 $pair="$User`:$Token"
$auth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers=@{Authorization="Basic $auth"}
$base=$JenkinsUrl.TrimEnd("/"); $job=[uri]::EscapeDataString($JobName)
$crumb=Invoke-RestMethod "$base/crumbIssuer/api/json" -Headers $headers; $headers["Jenkins-Crumb"]=$crumb.crumb
$before=(Invoke-RestMethod "$base/job/$job/api/json" -Headers $headers).nextBuildNumber
Invoke-WebRequest "$base/job/$job/build" -Method Post -Headers $headers | Out-Null
$deadline=(Get-Date).AddSeconds($TimeoutSeconds); do { Start-Sleep 5; $info=Invoke-RestMethod "$base/job/$job/$before/api/json" -Headers $headers } while($info.building -and (Get-Date) -lt $deadline)
$console=Invoke-RestMethod "$base/job/$job/$before/consoleText" -Headers $headers
$sha=(git rev-parse HEAD)
$analysis=[ordered]@{jobName=$JobName;buildNumber=$before;url=$info.url;result=$info.result;building=$info.building;gitSha=$sha;passed=([regex]::Matches($console,'(?m)\s(\d+) passed') | Select-Object -Last 1).Value;failed=([regex]::Matches($console,'(?m)\s(\d+) failed') | Select-Object -Last 1).Value;consoleTail=$console.Substring([Math]::Max(0,$console.Length-6000))}
$out=Join-Path $PSScriptRoot "..\output\jenkins\build-$before-analysis.json"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$analysis | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $out
Write-Output $out
if($info.result -ne "SUCCESS"){ exit 1 }
