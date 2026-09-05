#requires -Version 5.1
param([Parameter(Mandatory=$true)][string]$JenkinsUrl,[Parameter(Mandatory=$true)][string]$JobName,[Parameter(Mandatory=$true)][string]$User,[Parameter(Mandatory=$true)][string]$Token,[string]$OutputDir="output\\jenkins")
$ErrorActionPreference="Stop"
$pair="$User`:$Token"
$auth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes($pair))
$headers=@{Authorization="Basic $auth"}
$job=[uri]::EscapeDataString($JobName)
$base=$JenkinsUrl.TrimEnd("/")
$build=Invoke-RestMethod "$base/job/$job/lastBuild/api/json" -Headers $headers
$console=Invoke-RestMethod "$base/job/$job/$($build.number)/consoleText" -Headers $headers
$passedMatch=[regex]::Match($console,'(?m)\s(?<n>\d+) passed'); $failedMatch=[regex]::Match($console,'(?m)\s(?<n>\d+) failed'); $result=[ordered]@{jobName=$JobName;buildNumber=$build.number;url=$build.url;result=$build.result;building=$build.building;durationMs=$build.duration;gitSha=([regex]::Match($console,"(?m)^[0-9a-f]{40}$")).Value;passed=([int]$passedMatch.Groups["n"].Value);failed=([int]$failedMatch.Groups["n"].Value);consoleTail=($console.Substring([Math]::Max(0,$console.Length-4000)))}
$out=Join-Path $OutputDir "build-$($build.number)-analysis.json"
New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$result | ConvertTo-Json -Depth 5 | Set-Content -Encoding UTF8 $out
Write-Output $out

