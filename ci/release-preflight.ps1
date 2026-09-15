[CmdletBinding()]
param(
  [string]$ConfigPath,
  [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

function Invoke-Git([string]$WorkingDirectory, [string[]]$Arguments) {
  $output = & git -C $WorkingDirectory @Arguments 2>&1
  if ($LASTEXITCODE -ne 0) {
    throw "git command failed in '$WorkingDirectory': $($Arguments -join ' ')"
  }
  return (($output | Out-String).Trim())
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $ConfigPath) { $ConfigPath = Join-Path $scriptRoot 'release-repositories.json' }
if (-not (Test-Path -LiteralPath $ConfigPath -PathType Leaf)) {
  throw "release-governance-config-missing:$ConfigPath"
}
$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
if ($config.rules.allowForcePush -eq $true) { throw 'release-governance-force-push-forbidden' }
if ($config.rules.jenkinsTrigger -ne 'never') { throw 'release-preflight-must-not-trigger-jenkins' }

$root = (Resolve-Path (Join-Path $scriptRoot '..')).Path
$checks = @()
$errors = @()
foreach ($repo in $config.repositories) {
  $repoPath = (Resolve-Path (Join-Path $root $repo.path) -ErrorAction SilentlyContinue).Path
  $item = [ordered]@{
    id = [string]$repo.id
    repository = [string]$repo.repository
    path = $repoPath
    remote = [string]$repo.remote
    expectedBranch = [string]$repo.branch
    branch = $null
    localSha = $null
    remoteSha = $null
    status = 'blocked'
    reason = $null
  }
  try {
    if (-not $repoPath) { throw 'repository-path-missing' }
    $top = Invoke-Git $repoPath @('rev-parse','--show-toplevel')
    if ((Resolve-Path $top).Path -ne (Resolve-Path $repoPath).Path) { throw 'repository-root-mismatch' }
    $item.branch = Invoke-Git $repoPath @('symbolic-ref','--short','HEAD')
    if ($item.branch -ne $repo.branch) { throw "wrong-integration-branch:$($item.branch)" }
    $dirty = Invoke-Git $repoPath @('status','--porcelain=v1')
    if ($config.rules.requireCleanWorktree -eq $true -and $dirty) { throw 'worktree-not-clean' }
    $item.localSha = Invoke-Git $repoPath @('rev-parse','HEAD')
    $remoteLine = Invoke-Git $repoPath @('ls-remote',$repo.remote,"refs/heads/$($repo.branch)")
    if (-not $remoteLine) { throw 'remote-branch-missing' }
    $item.remoteSha = ($remoteLine -split '\s+')[0]
    if ($item.remoteSha -notmatch '^[0-9a-f]{40}$') { throw 'remote-sha-invalid' }
    if ($item.localSha -ne $item.remoteSha) {
      $localAncestor = & git -C $repoPath merge-base --is-ancestor $item.remoteSha $item.localSha
      $localAhead = $LASTEXITCODE -eq 0
      $remoteAncestor = & git -C $repoPath merge-base --is-ancestor $item.localSha $item.remoteSha
      $remoteAhead = $LASTEXITCODE -eq 0
      if ($config.rules.rejectDivergedHistory -eq $true -and -not ($localAhead -or $remoteAhead)) { throw 'history-diverged' }
      if ($remoteAhead) { throw 'local-branch-behind-remote' }
      $item.reason = 'local-branch-ahead-remote; push requires explicit review'
    }
    $item.status = 'ready'
  } catch {
    $item.reason = $_.Exception.Message
    $errors += "[$($repo.id)] $($item.reason)"
  }
  $checks += [pscustomobject]$item
}

$result = [ordered]@{
  schemaVersion = 1
  checkedAt = (Get-Date).ToUniversalTime().ToString('o')
  jenkinsTriggered = $false
  status = if ($errors.Count -eq 0) { 'ready' } else { 'blocked' }
  checks = $checks
  errors = $errors
}
$json = $result | ConvertTo-Json -Depth 8
if ($OutputPath) { $json | Set-Content -LiteralPath $OutputPath -Encoding UTF8 }
Write-Output $json
if ($errors.Count -gt 0) { exit 2 }
