[CmdletBinding()]
param(
  [string]$ManifestPath = (Join-Path (Get-Location) 'ci/dependency-manifest.json')
)
$ErrorActionPreference = 'Stop'
$manifest = Get-Content -Raw -LiteralPath $ManifestPath | ConvertFrom-Json
$package = $manifest.repositories.tapContractPackage
if ($package.name -ne '@menusifu/tap-contract') { throw 'TAP contract package name mismatch' }
if ($package.version -ne '1.1.3') { throw 'TAP contract package version mismatch' }
if ($package.checkout -ne $null) { throw 'TAP contract package must not have a checkout' }
if ($package.artifact -notmatch 'Merchant Center UITest/vendor/menusifu-tap-contract-1\.1\.3\.tgz$') { throw 'TAP contract artifact path mismatch' }
Write-Output ($package | ConvertTo-Json -Compress)
