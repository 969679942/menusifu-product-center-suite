[CmdletBinding()]
param(
    [string]$CodexHome = (Join-Path $env:USERPROFILE '.codex'),
    [string]$ProjectPath = 'D:\Menusifu\Merchant Center',
    [switch]$AllProjects,
    [switch]$FailOnIssues
)

$ErrorActionPreference = 'Stop'

function Write-Check {
    param(
        [string]$Name,
        [int]$Count,
        [string]$Detail
    )

    $status = if ($Count -eq 0) { 'PASS' } else { 'WARN' }
    $color = if ($Count -eq 0) { 'Green' } else { 'Yellow' }
    Write-Host (('[{0}] {1}: {2}' -f $status, $Name, $Detail)) -ForegroundColor $color
    return ($Count -gt 0)
}

if (-not (Test-Path -LiteralPath $CodexHome)) {
    throw "Codex 数据目录不存在：$CodexHome"
}

$dbPath = Join-Path $CodexHome 'state_5.sqlite'
$configPath = Join-Path $CodexHome 'config.toml'
$sessionsPath = Join-Path $CodexHome 'sessions'
$archivedSessionsPath = Join-Path $CodexHome 'archived_sessions'

if (-not (Test-Path -LiteralPath $dbPath)) {
    throw "Codex 状态库不存在：$dbPath"
}

$sqlite = Get-Command sqlite3 -ErrorAction SilentlyContinue
if (-not $sqlite) {
    throw '未找到 sqlite3。请安装 SQLite CLI，或把 sqlite3.exe 加入 PATH。'
}

$provider = 'unknown'
if (Test-Path -LiteralPath $configPath) {
    $providerLine = Select-String -LiteralPath $configPath -Pattern '^\s*model_provider\s*=\s*"([^"]+)"' | Select-Object -First 1
    if ($providerLine) {
        $provider = $providerLine.Matches[0].Groups[1].Value
    }
}

$projectPattern = $ProjectPath.ToLowerInvariant()
$query = @"
SELECT
  id || '|' || archived || '|' || COALESCE(model_provider,'') || '|' || COALESCE(thread_source,'') || '|' || has_user_event || '|' || replace(replace(title,char(10),' '),char(13),' ')
FROM threads
WHERE thread_source='user'
$(if ($AllProjects) { '' } else { "  AND lower(cwd) LIKE '%$projectPattern%'" });
"@

$rows = @(& $sqlite.Source $dbPath $query)
$threads = foreach ($row in $rows) {
    $parts = $row -split '\|', 6
    if ($parts.Count -eq 6) {
        [pscustomobject]@{
            Id = $parts[0]
            Archived = [int]$parts[1]
            Provider = $parts[2]
            Source = $parts[3]
            HasUserEvent = [int]$parts[4]
            Title = $parts[5]
        }
    }
}

$active = @($threads | Where-Object Archived -eq 0)
$archived = @($threads | Where-Object Archived -eq 1)
$missingEvent = @($active | Where-Object HasUserEvent -ne 1)
$wrongProvider = @($active | Where-Object Provider -ne $provider)
$missingRollout = @($threads | Where-Object {
    $rollout = @(
        Get-ChildItem -LiteralPath $sessionsPath -Recurse -File -Filter "*$($_.Id).jsonl" -ErrorAction SilentlyContinue
        Get-ChildItem -LiteralPath $archivedSessionsPath -Recurse -File -Filter "*$($_.Id).jsonl" -ErrorAction SilentlyContinue
    ) | Select-Object -First 1
    -not $rollout
})

Write-Host "Codex History Health Check" -ForegroundColor Cyan
if ($AllProjects) {
    Write-Host '范围: 整个 Codex（所有项目及 projectless 任务）'
} else {
    Write-Host "项目: $ProjectPath"
}
Write-Host "状态库: $dbPath"
Write-Host "当前 provider: $provider"
Write-Host "用户任务总数: $($threads.Count)；未归档: $($active.Count)；已归档: $($archived.Count)"

$issues = 0
if (Write-Check '未归档任务缺少用户消息标记' $missingEvent.Count "发现 $($missingEvent.Count) 条") { $issues += $missingEvent.Count }
if (Write-Check '未归档任务引用非当前 provider' $wrongProvider.Count "发现 $($wrongProvider.Count) 条") { $issues += $wrongProvider.Count }
if (Write-Check '会话 rollout 文件缺失' $missingRollout.Count "发现 $($missingRollout.Count) 条") { $issues += $missingRollout.Count }
if (Write-Check '已归档用户任务' $archived.Count "发现 $($archived.Count) 条（归档不等于丢失，请按需恢复）") { $issues += $archived.Count }

if ($missingEvent.Count -gt 0) {
    Write-Host "`n需要修复 has_user_event 的任务:" -ForegroundColor Yellow
    $missingEvent | ForEach-Object { Write-Host "- $($_.Id) $($_.Title)" }
}
if ($wrongProvider.Count -gt 0) {
    Write-Host "`n引用旧 provider 的任务:" -ForegroundColor Yellow
    $wrongProvider | ForEach-Object { Write-Host "- $($_.Id) provider=$($_.Provider) $($_.Title)" }
}
if ($archived.Count -gt 0) {
    Write-Host "`n已归档任务（脚本不会自动取消归档）:" -ForegroundColor DarkYellow
    $archived | ForEach-Object { Write-Host "- $($_.Id) $($_.Title)" }
}

if ($FailOnIssues -and $issues -gt 0) {
    exit 1
}
exit 0
