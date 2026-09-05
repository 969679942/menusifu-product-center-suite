param([string]$JenkinsUrl='http://192.168.1.50:8081',[string]$JobName='menusifu-product-center-suite',[Parameter(Mandatory=$true)][string]$User,[Parameter(Mandatory=$true)][string]$Token,[int]$TimeoutSeconds=900)
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
git push
if($LASTEXITCODE -ne 0){throw 'git push failed'}
$expected=(git rev-parse HEAD).Trim()
$auth=[Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("$User`:$Token")); $h=@{Authorization="Basic $auth"}
$base=$JenkinsUrl.TrimEnd('/'); $job=[uri]::EscapeDataString($JobName)
$c=Invoke-RestMethod "$base/crumbIssuer/api/json" -Headers $h; $h[$c.crumbRequestField]=$c.crumb
$r=Invoke-WebRequest "$base/job/$job/build" -Method Post -Headers $h
$queue=$r.Headers.Location
$deadline=(Get-Date).AddSeconds($TimeoutSeconds)
do { Start-Sleep 2; $q=Invoke-RestMethod ($queue+'api/json') -Headers $h; if($q.cancelled){throw 'queue cancelled'} } while(!$q.executable -and (Get-Date) -lt $deadline)
if(!$q.executable){throw 'queue timeout'}
$n=$q.executable.number
$build=$q.executable.url
do { Start-Sleep 3; $info=Invoke-RestMethod ($build+'api/json') -Headers $h } while($info.building -and (Get-Date) -lt $deadline)
if($info.building){throw "build $n timeout"}
$console=(Invoke-WebRequest ($build+'consoleText') -Headers $h).Content
$sha=[regex]::Match($console,'COMMIT_SHA=\s*\r?\n([0-9a-f]{40})').Groups[1].Value
$pass=[regex]::Matches($console,'(?m)\b(\d+) passed\b') | Select-Object -Last 1
$fail=[regex]::Matches($console,'(?m)\b(\d+) failed\b') | Select-Object -Last 1
$category=if($info.result -eq 'SUCCESS'){'success'}elseif($console -match 'ENOENT|Cannot find module|ECONN|ETIMEDOUT'){'technical-environment'}else{'contract-or-product-finding'}
$analysis=[ordered]@{schemaVersion=1;jobName=$JobName;buildNumber=$n;url=$build;result=$info.result;gitSha=$sha;expectedGitSha=$expected;shaVerified=($sha -eq $expected);passed=if($pass){[int]$pass.Groups[1].Value}else{0};failed=if($fail){[int]$fail.Groups[1].Value}else{0};category=$category;actionRequired=if($category -eq 'success'){'none'}else{'ai-evidence-review'};artifacts=$info.artifacts}
$out=Join-Path $PSScriptRoot "..\output\jenkins\build-$n-analysis.json"; New-Item -ItemType Directory -Force (Split-Path $out) | Out-Null
$analysis | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 $out
Write-Output $out
if(!$analysis.shaVerified){throw 'build SHA mismatch'}
if($info.result -ne 'SUCCESS'){exit 1}
