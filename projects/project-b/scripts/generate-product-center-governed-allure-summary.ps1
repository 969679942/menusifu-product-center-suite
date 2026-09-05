$ErrorActionPreference = 'Stop'
$projectRoot = 'D:\Menusifu\Merchant Center\Merchant Center UITest'
$workspaceRoot = 'D:\Menusifu\Merchant Center'
$sourcePath = Join-Path $workspaceRoot 'deliverables\product-center-source-governance\execution-result.json'
$resultsDir = Join-Path $projectRoot 'output\allure-product-center-governed-20260830\allure-results'
$reportDir = Join-Path $projectRoot 'output\allure-product-center-governed-20260830\allure-report'

if (-not (Test-Path -LiteralPath $sourcePath)) { throw "来源治理结果不存在：$sourcePath" }
if (Test-Path -LiteralPath $resultsDir) { Remove-Item -LiteralPath $resultsDir -Recurse -Force }
if (Test-Path -LiteralPath $reportDir) { Remove-Item -LiteralPath $reportDir -Recurse -Force }
New-Item -ItemType Directory -Path $resultsDir -Force | Out-Null

$source = Get-Content -LiteralPath $sourcePath -Raw | ConvertFrom-Json
$cases = @($source.executionCases)
$epoch = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()

foreach ($case in $cases) {
  $uuid = [Guid]::NewGuid().ToString()
  $started = if ($case.latestAttempt.startedAt) {
    [DateTimeOffset]::Parse($case.latestAttempt.startedAt).ToUnixTimeMilliseconds()
  } else { $epoch }
  $duration = if ($case.latestAttempt.durationMs) { [int64]$case.latestAttempt.durationMs } else { 0 }
  $status = if ($case.status -eq 'passed') { 'passed' } else { 'failed' }
  $evidence = if ($case.latestAttempt.evidencePath) { $case.latestAttempt.evidencePath } else { '无当前执行收据' }
  $diagnostic = if ($case.latestAttempt.status -eq 'failed') { "失败分类：当前来源治理结果中的失败用例`n证据路径：$evidence" } else { '当前用例无失败诊断。' }
  $receipt = [ordered]@{
    caseId = $case.caseId
    status = $case.status
    module = $case.module
    attemptCount = $case.attemptCount
    startedAt = $case.latestAttempt.startedAt
    durationMs = $duration
    evidencePath = $evidence
    sourceResult = 'deliverables/product-center-source-governance/execution-result.json'
  } | ConvertTo-Json -Depth 8
  $receiptName = "$uuid-receipt.txt"
  Set-Content -LiteralPath (Join-Path $resultsDir $receiptName) -Value $receipt -Encoding utf8
  $result = [ordered]@{
    uuid = $uuid
    name = "[$($case.caseId)] $($case.title)"
    historyId = $case.caseId
    status = $status
    statusDetails = [ordered]@{ message = if ($status -eq 'failed') { '来源治理执行结果判定失败，详见失败诊断。' } else { '' } }
    stage = 'finished'
    steps = @(
      [ordered]@{ name = "用例标识：$($case.caseId)"; status = 'passed'; stage = 'finished'; steps = @(); attachments = @(); parameters = @() },
      [ordered]@{ name = "业务模块：$($case.module)"; status = 'passed'; stage = 'finished'; steps = @(); attachments = @(); parameters = @() },
      [ordered]@{ name = "执行结论：$status"; status = $status; stage = 'finished'; steps = @(); attachments = @(); parameters = @() },
      [ordered]@{ name = '执行收据：当前结果与证据索引'; status = 'passed'; stage = 'finished'; steps = @(); attachments = @([ordered]@{ name = '执行收据（结构化）'; source = $receiptName; type = 'text/plain' }); parameters = @() },
      [ordered]@{ name = if ($status -eq 'failed') { '失败诊断：查看修复队列中的分类与下一动作' } else { '结果核对：当前执行收据为通过' }; status = $status; stage = 'finished'; steps = @(); attachments = @(); parameters = @() }
    )
    attachments = @()
    parameters = @([ordered]@{ name = '执行次数'; value = [string]$case.attemptCount }, [ordered]@{ name = '耗时（毫秒）'; value = [string]$duration }, [ordered]@{ name = '原始证据路径'; value = $evidence })
    labels = @(
      [ordered]@{ name = 'language'; value = 'javascript' },
      [ordered]@{ name = 'framework'; value = 'playwright' },
      [ordered]@{ name = 'package'; value = 'merchant-center-ui-automation.product-center.source-governed-summary' },
      [ordered]@{ name = 'tag'; value = 'product-center-source-governed' },
      [ordered]@{ name = 'tag'; value = "case-$($case.caseId)" },
      [ordered]@{ name = 'caseId'; value = $case.caseId },
      [ordered]@{ name = 'module'; value = $case.module }
    )
    links = @()
    start = $started
    stop = $started + $duration
    testCaseId = $case.caseId
    fullName = "product-center/source-governed/$($case.caseId)"
    titlePath = @('Merchant Center', '商品中心来源治理执行结果', $case.module, $case.caseId)
  }
  if ($status -eq 'failed') {
    $diagnosticName = "$uuid-diagnostic.txt"
    Set-Content -LiteralPath (Join-Path $resultsDir $diagnosticName) -Value $diagnostic -Encoding utf8
    $result.steps[4].attachments = @([ordered]@{ name = '失败诊断（原始分类索引）'; source = $diagnosticName; type = 'text/plain' })
  }
  $result | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $resultsDir "$uuid-result.json") -Encoding utf8
}

Set-Content -LiteralPath (Join-Path $resultsDir 'environment.properties') -Value @(
  'reportType=商品中心来源治理执行结果摘要'
  'source=deliverables/product-center-source-governance/execution-result.json'
  "summary=$($source.summary.executed) executed; $($source.summary.passed) passed; $($source.summary.failed) failed"
  'note=本报告由已接受的来源治理执行收据生成，不代表重新运行用例'
) -Encoding utf8

Write-Output "resultsDir=$resultsDir"
Write-Output "reportDir=$reportDir"
Write-Output "caseCount=$($cases.Count)"
