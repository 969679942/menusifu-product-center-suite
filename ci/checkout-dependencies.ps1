[CmdletBinding()]
param(
  [Parameter(Mandatory=$true)][string]$McRepository,
  [Parameter(Mandatory=$true)][string]$McSha,
  [Parameter(Mandatory=$true)][string]$TapRepository,
  [Parameter(Mandatory=$true)][string]$TapSha,
  [string]$Root = (Join-Path (Get-Location) 'sources')
)
$ErrorActionPreference = 'Stop'
foreach($pair in @(@('MC',$McSha),@('TAP',$TapSha))){ if($pair[1] -notmatch '^[0-9a-fA-F]{40}$'){ throw "$($pair[0]) exact SHA required" } }
$rootPath=[IO.Path]::GetFullPath($Root); New-Item -ItemType Directory -Force $rootPath | Out-Null
function Checkout([string]$name,[string]$repo,[string]$sha){
  $dest=Join-Path $rootPath $name
  if(Test-Path $dest){ throw "Destination already exists; preserve existing checkout: $name" }
  git clone --no-checkout $repo $dest
  if($LASTEXITCODE -ne 0){throw "$name clone failed"}
  git -C $dest checkout --detach $sha
  if($LASTEXITCODE -ne 0){throw "$name checkout failed"}
  $actual=(git -C $dest rev-parse HEAD).Trim()
  if($actual -ne $sha.ToLower()){ throw "$name checkout SHA mismatch" }
  return $actual
}
$manifest=[ordered]@{schemaVersion=1;mcGitSha=(Checkout 'merchant-center' $McRepository $McSha);tapGitSha=(Checkout 'tap' $TapRepository $TapSha);root=$rootPath.Replace('\','/');createdAt=[DateTime]::UtcNow.ToString('o')}
$manifest | ConvertTo-Json | Set-Content -Encoding UTF8 (Join-Path $rootPath 'dependency-checkout.json')
Write-Output ($manifest | ConvertTo-Json -Compress)
