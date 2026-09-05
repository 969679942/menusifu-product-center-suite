param([Parameter(Mandatory=$true)][string]$Link,[Parameter(Mandatory=$true)][string]$Target)
$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$allowed=[IO.Path]::GetFullPath((Join-Path $root 'output/worker/worktrees'))+[IO.Path]::DirectorySeparatorChar
$resolved=[IO.Path]::GetFullPath($Link)
if(-not $resolved.StartsWith($allowed,[StringComparison]::OrdinalIgnoreCase) -or [IO.Path]::GetFileName($resolved) -ne 'node_modules'){throw 'Dependency link outside owned worktree'}
New-Item -ItemType Junction -Path $resolved -Target $Target | Out-Null
