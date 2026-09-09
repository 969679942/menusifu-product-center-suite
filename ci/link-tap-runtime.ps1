$ErrorActionPreference='Stop'
$root=[IO.Path]::GetFullPath((Split-Path $PSScriptRoot -Parent))
$target=Join-Path $root 'tap'
if(-not (Test-Path -LiteralPath (Join-Path $target 'package.json'))){throw 'TAP runtime missing'}
# Legacy script entry points are aliases to the one checked-out runtime; no source is copied.
foreach($relative in @('projects/Test Automation Platform','projects/merchant-center/Test Automation Platform')){
  $link=[IO.Path]::GetFullPath((Join-Path $root $relative))
  if(-not $link.StartsWith($root+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Alias outside workspace'}
  if(Test-Path -LiteralPath $link){throw 'Refuse to overwrite existing runtime alias or source'}
  New-Item -ItemType Junction -Path $link -Target $target | Out-Null
}
