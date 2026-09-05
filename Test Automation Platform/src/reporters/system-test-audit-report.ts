export type AuditReportResult = {
  schemaVersion?: string;
  status: string;
  mode: string;
  applicationId: string;
  systemId: string;
  runIds: string[];
  eventLogPath: string;
  evidenceLedgers: string[];
  summary: {
    planned: number;
    auditEligible: number;
    classifiedExclusions: number;
    auditComplete: number;
    auditIncomplete: number;
    invariantSatisfied: boolean;
    auditEvents: number;
  };
  generatedAt: string;
  executionContext?: Record<string, unknown>;
  integrity?: { valid?: boolean; count?: number; diagnostics?: string[] };
  timing?: {
    startedAt?: string;
    completedAt?: string;
    durationMs?: number;
    phases?: Record<string, { startedAt?: string; completedAt?: string; durationMs?: number; status?: string }>;
  };
  history?: Array<{ runId: string; occurredAt?: string; eventCount: number; dataChanges: number; failures: number; durationMs: number; stepCount?: number; stepCoveragePercent?: number; unclosedSteps?: number; reportPath?: string }>;
  artifacts?: { json?: string; html?: string; csv?: string; printHtml?: string; pdf?: string; readableLog?: string; overviewHtml?: string; casesHtml?: string; eventsHtml?: string };
  archiveDirectory?: string;
};

/** Lightweight split views for large runs. They reuse the same serialized inputs and do not
 * participate in status arbitration; the canonical JSON/ledger remains authoritative. */
export function renderSystemTestAuditSplitHtml(input: {
  result: AuditReportResult;
  ledgers: JsonRecord[];
  events: JsonRecord[];
  view: 'overview' | 'cases' | 'events';
}): string {
  const { result, ledgers, events, view } = input;
  const cases = collectCases(ledgers);
  const title = view === 'overview' ? '运行总览' : view === 'cases' ? '逐案证据' : '事件日志';
  const body = view === 'overview'
    ? `<section class="metrics"><div><b>状态</b><strong>${escapeHtml(statusLabel(result.status))}</strong></div><div><b>计划</b><strong>${result.summary.planned}</strong></div><div><b>审计完整</b><strong>${result.summary.auditComplete}</strong></div><div><b>审计不完整</b><strong>${result.summary.auditIncomplete}</strong></div><div><b>事件数</b><strong>${events.length}</strong></div></section><p>运行：<code>${escapeHtml(result.runIds.join(', ') || '未执行')}</code></p><p>生成时间：${escapeHtml(result.generatedAt)}</p><p>数据守恒：${result.summary.invariantSatisfied ? '通过' : '未通过'}。详细收据请打开机器 JSON 与证据账本。</p>`
    : view === 'cases'
      ? `<table><thead><tr><th>用例</th><th>审计状态</th><th>执行结果</th><th>操作数</th><th>断言数</th><th>清理对象</th></tr></thead><tbody>${cases.map((item) => `<tr><td>${escapeHtml(item.caseId)}</td><td>${escapeHtml(auditStatusLabel(item.auditStatus))}</td><td>${escapeHtml(executionStatusLabel(item.executionStatus))}</td><td>${item.operationCount}</td><td>${item.assertionCount}</td><td>${item.cleanupObjectCount}</td></tr>`).join('')}</tbody></table>`
      : `<table><thead><tr><th>时间</th><th>类型</th><th>阶段</th><th>用例</th><th>结果</th><th>说明</th></tr></thead><tbody>${events.map((event) => { const d = asRecord(event.details); return `<tr><td>${escapeHtml(String(event.occurredAt ?? ''))}</td><td>${escapeHtml(eventTypeLabel(String(event.eventType ?? '')))}</td><td>${escapeHtml(phaseLabel(event))}</td><td>${escapeHtml(String(event.caseId ?? ''))}</td><td>${escapeHtml(outcomeLabel(String(event.outcome ?? 'record')))}</td><td>${escapeHtml(String(d.title ?? d.operationKey ?? ''))}</td></tr>`; }).join('')}</tbody></table>`;
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:14px/1.55 system-ui,"Microsoft YaHei",sans-serif;margin:24px;color:#172033;background:#f5f7fb}main{max-width:1400px;margin:auto;background:#fff;padding:24px;border:1px solid #d8dee9;border-radius:10px}h1{margin-top:0}table{width:100%;border-collapse:collapse}th,td{padding:9px;border-bottom:1px solid #d8dee9;text-align:left;vertical-align:top}th{background:#f8fafc;color:#667085}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}.metrics div{border:1px solid #d8dee9;border-radius:8px;padding:12px}.metrics b,.metrics strong{display:block}.metrics b{color:#667085;font-size:12px}.metrics strong{font-size:22px;margin-top:4px}code{word-break:break-all}</style></head><body><main><h1>${title}</h1><p>${escapeHtml(result.applicationId)} · ${escapeHtml(result.systemId)}</p>${body}<p><a href="audit-pipeline-report.html">打开综合报告</a> · <a href="audit-pipeline-result.json">机器结果</a></p></main></body></html>\n`;
}

type JsonRecord = Record<string, unknown>;
type AuditRunHistory = { runId: string; occurredAt?: string; eventCount: number; dataChanges: number; failures: number; durationMs: number; stepCount?: number; stepCoveragePercent?: number; unclosedSteps?: number; reportPath?: string };

export function renderSystemTestAuditHtml(input: {
  result: AuditReportResult;
  ledgers: JsonRecord[];
  events: JsonRecord[];
  historicalEvents?: JsonRecord[];
}): string {
  const { result, ledgers, events } = input;
  const historicalEvents = input.historicalEvents ?? events;
  const cases = collectCases(ledgers);
  const residueCases = cases.filter((item) => item.residue).length;
  const assertionCount = cases.reduce((total, item) => total + item.assertionCount, 0);
  const contextGuardCount = cases.reduce((total, item) => total + item.contextGuardCount, 0);
  const cleanupObjectCount = cases.reduce((total, item) => total + item.cleanupObjectCount, 0);
  const correctionCounts = aggregateCorrections(events);
  const durationMs = aggregateDuration(events, cases);
  const reportHealth = evaluateReportHealth(result, events);
  const stepCoverage = analyzeStepCoverage(events);
  const assertionRows = cases.flatMap((item) => renderAssertions(item));
  const correctionRows = renderCorrections(events);
  const caseChangeRows = renderCaseChanges(events);
  const businessRuleRows = renderBusinessRuleChanges(events);
  const scenarioSummary = summarizeOtherScenarios(events);
  const cleanupRows = renderCleanup(cases);
  const currentRunId = result.runIds.join(', ') || '未执行';
  const history = result.history ?? [];
  const currentEventRunIds = new Set(events.map((event) => String(event.runId ?? '')).filter(Boolean));
  const previousRunId = history.find((run) => !currentEventRunIds.has(run.runId))?.runId;
  const historyTotals = history.reduce((total, run) => ({
    events: total.events + run.eventCount,
    changes: total.changes + run.dataChanges,
    failures: total.failures + run.failures,
    durationMs: total.durationMs + run.durationMs,
  }), { events: 0, changes: 0, failures: 0, durationMs: 0 });
  const runsWithChanges = history.filter((run) => run.dataChanges > 0).length;
  const runsWithFailures = history.filter((run) => run.failures > 0).length;
  const archivedRuns = history.filter((run) => Boolean(run.reportPath)).length;
  const averageDurationMs = history.length ? Math.round(historyTotals.durationMs / history.length) : 0;
  const conclusion = result.status === 'audit-complete' && result.summary.auditIncomplete === 0
    ? `本次运行已完成，${result.summary.auditComplete} 条适用用例的审计证据完整，未发现清理残留。`
    : `本次运行状态为“${statusLabel(result.status)}”，有 ${result.summary.auditIncomplete} 条用例的审计证据不完整。`;
  const overviewGroups = [
    ['总体结论', `<strong>已累计记录 ${history.length} 次运行，当前报告收录 ${historicalEvents.length}/${historyTotals.events} 条历史事件。</strong><br><span class="muted">${runsWithFailures === 0 ? '历史中暂未记录失败事件。' : `${runsWithFailures} 次运行记录过失败事件，需进入对应运行查看。`} 本区只描述历史记录，不裁决具体业务用例是否通过。</span>`],
    ['累计运行规模', `累计 ${history.length} 次运行、${historyTotals.events} 条事件；总耗时 ${formatDuration(historyTotals.durationMs)}，平均每次 ${formatDuration(averageDurationMs)}。`],
    ['累计变更与异常', `${runsWithChanges} 次运行发生过数据变更，共 ${historyTotals.changes} 次；${runsWithFailures} 次运行出现失败，共 ${historyTotals.failures} 个失败事件。`],
    ['历史归档覆盖', `${archivedRuns} 次运行具有完整独立报告；${history.length - archivedRuns} 次早期运行仅保留事件日志。全部运行均列在下方记录表中。`],
  ].map(([title, body]) => `<article class="summary-group"><h3>${escapeHtml(String(title))}</h3><p>${body}</p></article>`).join('');

  const caseRows = cases.map((item) => renderCase(item)).join('');
  const eventRows = events.map((event) => renderEvent(event)).join('');
  const jsonLinks = result.evidenceLedgers.map((file) => `<code>${escapeHtml(file)}</code>`).join('<br>') || '<span class="muted">未执行</span>';
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'">
<title>系统测试审计报告 · ${escapeHtml(result.applicationId)}</title>
<style>
:root{color-scheme:light;--bg:#f5f7fb;--panel:#fff;--ink:#172033;--muted:#667085;--line:#d8dee9;--blue:#2563eb;--green:#08783e;--amber:#a15c00;--red:#b42318;--shadow:0 2px 10px #17203312}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.55 system-ui,-apple-system,"Segoe UI","Microsoft YaHei",sans-serif}main{max-width:1500px;margin:0 auto;padding:28px 32px 56px}header{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:20px}h1{font-size:28px;line-height:1.2;margin:0 0 6px}h2{font-size:18px;margin:30px 0 12px}.subtitle,.muted{color:var(--muted)}.header-meta{text-align:right;color:var(--muted);font-size:12px}.badge{display:inline-flex;align-items:center;padding:3px 9px;border-radius:999px;font-weight:650;font-size:12px}.badge.success{background:#dcfce7;color:var(--green)}.badge.info{background:#dbeafe;color:#1d4ed8}.badge.warning{background:#fef3c7;color:var(--amber)}.badge.danger{background:#fee4e2;color:var(--red)}.notice{border:1px solid var(--line);border-left:4px solid var(--blue);background:var(--panel);padding:12px 16px;border-radius:8px;margin:14px 0;box-shadow:var(--shadow)}.notice.ok{border-left-color:var(--green)}.notice.warn{border-left-color:var(--amber)}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:12px}.metric,.panel{background:var(--panel);border:1px solid var(--line);border-radius:10px;box-shadow:var(--shadow)}.metric{padding:14px 16px}.metric-title{color:var(--muted);font-size:12px}.metric-value{font-size:24px;font-weight:720;margin:3px 0}.metric-hint{color:var(--muted);font-size:12px}.panel{padding:16px;overflow:hidden}.toolbar{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:12px}.toolbar input,.toolbar select{border:1px solid var(--line);border-radius:6px;padding:8px 10px;background:#fff;color:var(--ink);min-height:36px}.toolbar input{min-width:260px;flex:1}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:900px}th,td{padding:10px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:12px;color:var(--muted);background:#f8fafc;position:sticky;top:0;z-index:1}tr[data-hidden="true"]{display:none}.case-id{font-weight:650;white-space:nowrap}.pill{display:inline-block;padding:2px 7px;border-radius:999px;font-size:11px;background:#eef2f6;color:#475467;margin:1px 2px 1px 0}.pill.changed{background:#dbeafe;color:#1d4ed8}.pill.clean{background:#dcfce7;color:var(--green)}.pill.dirty{background:#fee4e2;color:var(--red)}.pill.excluded{background:#f2f4f7;color:#667085}.progress{height:8px;background:#e5e7eb;border-radius:99px;overflow:hidden}.progress>span{display:block;height:100%;background:var(--green)}details{border-top:1px solid var(--line);padding:10px 0}details:first-child{border-top:0}summary{cursor:pointer;font-weight:650}dl{display:grid;grid-template-columns:180px 1fr;gap:5px 16px;margin:10px 0}dt{color:var(--muted)}dd{margin:0;word-break:break-word}.timeline{display:grid;gap:8px}.event{display:grid;grid-template-columns:145px 160px 1fr auto;gap:12px;align-items:start;border-left:3px solid #cbd5e1;padding:8px 12px;background:#fafbfc}.event.success{border-left-color:var(--green)}.event.failed{border-left-color:var(--red)}.event-time,.event-type{font-size:12px;color:var(--muted)}pre{background:#0f172a;color:#dbeafe;border-radius:8px;padding:14px;overflow:auto;font-size:12px;line-height:1.45}code{font-family:ui-monospace,SFMono-Regular,Consolas,monospace;font-size:12px;word-break:break-all}.footer{margin-top:24px;color:var(--muted);font-size:12px}@media(max-width:760px){main{padding:18px 14px}header{display:block}.header-meta{text-align:left;margin-top:10px}.event{grid-template-columns:1fr}.event-time,.event-type{font-size:11px}dl{grid-template-columns:1fr}.toolbar input{min-width:0;width:100%}}
@media(prefers-color-scheme:dark){:root{color-scheme:dark;--bg:#0b1220;--panel:#111827;--ink:#e5e7eb;--muted:#9ca3af;--line:#293548;--shadow:none}.toolbar input,.toolbar select{background:#0f172a;color:var(--ink)}th{background:#172033}.event{background:#0f172a}.progress{background:#293548}}
@media print{body{background:#fff}main{max-width:none;padding:0}.toolbar,#report-actions{display:none}.panel,.metric{box-shadow:none;break-inside:avoid}h2{break-after:avoid}}
.section-intro{color:var(--muted);margin:0 0 12px}.summary-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.summary-group{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:16px;box-shadow:var(--shadow)}.summary-group h3{margin:0 0 6px;font-size:15px}.summary-group p{margin:0}.current-run{border-left:4px solid var(--blue)}.purpose{background:#f8fafc;border:1px solid var(--line);padding:10px 12px;border-radius:8px;color:var(--muted);margin-bottom:12px}.event{grid-template-columns:110px 145px 140px 1fr auto}.trend-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.trend-card{border:1px solid var(--line);border-radius:8px;padding:12px;background:#fafbfc}.trend-card h3{font-size:14px;margin:0 0 4px}.trend-card svg{display:block;width:100%;height:150px}.trend-card .axis{stroke:#cbd5e1;stroke-width:1}.history-current{background:#eff6ff}.run-summary{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.run-events{margin-top:10px}@media(max-width:900px){.summary-grid,.trend-grid{grid-template-columns:1fr}.event{grid-template-columns:1fr}}
</style></head><body><main>
<header><div><h1>系统测试审计报告</h1><div class="subtitle">${escapeHtml(result.applicationId)} · ${escapeHtml(modeLabel(result.mode))} · 生成于 ${escapeHtml(result.generatedAt)}</div></div><div class="header-meta">系统：${escapeHtml(result.systemId)}<br>运行编号：${escapeHtml(result.runIds.join(', ') || '未执行')}</div></header>
<div id="data-invariant" class="notice ${result.summary.invariantSatisfied ? 'ok' : 'warn'}"><strong>${result.summary.invariantSatisfied ? '数据守恒校验通过' : '数据守恒校验未通过'}</strong>　计划总数 = 可审计数 + 已排除数；可审计数 = 审计完整数 + 审计不完整数</div>
<h2>全部运行总览</h2><p class="section-intro">这里汇总从首次记录到本次运行的全部历史，并单独标出本次结论。历史事件来自追加日志，不会因下一次执行被覆盖。</p><section class="summary-grid" aria-label="全部运行总览">${overviewGroups}</section>
<div id="report-actions" class="toolbar"><button type="button" id="download-csv">下载 CSV</button><button type="button" onclick="window.print()">打印 / 另存为 PDF</button>${result.artifacts?.csv ? '<a href="audit-pipeline-report.csv" download>打开 CSV 文件</a>' : ''}</div>
<h2>运行趋势图</h2><p class="section-intro">按时间从早到晚展示全部运行的事件数、数据变更、失败事件和耗时。图表用于观察趋势，精确数值以运行记录表为准。</p><section class="panel">${renderTrendDashboard(history)}</section>
<h2>全部运行记录</h2><p class="section-intro">每次运行都保留一行汇总；“本次”与“上次”明确标识。展开运行可查看该次全部事件，有完整快照的运行还能直接打开归档报告。</p><section class="panel">${renderHistory(history, currentEventRunIds, previousRunId)}${renderHistoricalRunRecords(historicalEvents, currentEventRunIds, previousRunId)}</section>
<h2>本次运行身份</h2><p class="section-intro">这里明确当前运行。顶层综合报告会持续累积全部历史，并将最新执行标记为“本次”；每次运行同时另存独立归档。</p><section class="panel current-run"><dl><dt>当前运行编号</dt><dd><code>${escapeHtml(currentRunId)}</code></dd><dt>本次流程状态</dt><dd>${escapeHtml(statusLabel(result.status))}</dd><dt>本次审计结论</dt><dd>${escapeHtml(conclusion)}<br><span class="muted">具体业务通过资格仍由标准执行收据和公共状态裁决器决定。</span></dd><dt>生成时间</dt><dd>${escapeHtml(result.generatedAt)}</dd><dt>更新与保留规则</dt><dd>下次执行会把本次转为历史、追加新记录并刷新综合报告；本次独立归档不会被覆盖。</dd><dt>本次归档位置</dt><dd><code>${escapeHtml(result.archiveDirectory ?? '本次尚未生成独立归档')}</code></dd><dt>运行环境</dt><dd>${renderExecutionContext(result)}</dd></dl></section>
<h2>逐条用例核对</h2><p class="section-intro">用途：逐条确认哪些用例进入了本次审计、是否执行、改了什么、证据与清理是否完整。出现“不完整”“失败”或“有残留”时才需要展开详情处理。</p><section class="panel"><div class="purpose"><strong>阅读方法：</strong>先看“审计状态”和“执行结果”，再看“变更字段”，最后确认“证据/清理”。</div><div class="toolbar"><label>搜索 <input id="case-search" type="search" placeholder="用例编号、操作或变更字段"></label><label>状态 <select id="case-status"><option value="">全部</option><option value="complete">完整</option><option value="incomplete">不完整</option><option value="excluded">已排除</option></select></label><label>变更 <select id="case-change"><option value="">全部</option><option value="changed">有变更</option><option value="unchanged">无变更</option></select></label></div><div class="table-wrap"><table id="case-table"><thead><tr><th>用例编号</th><th>证据是否完整</th><th>本次是否执行成功</th><th>业务操作次数</th><th>本次改了什么</th><th>证据与清理结论</th></tr></thead><tbody>${caseRows || '<tr><td colspan="6" class="muted">暂无用例记录</td></tr>'}</tbody></table></div></section>
<h2>本次流程时间线</h2><p class="section-intro">用途：按流程阶段复盘“准备 → 业务操作 → 结果验证 → 数据清理 → 收口”。只展示当前运行，不混入历史事件。</p><section class="panel"><div class="notice">当前运行编号：<code>${escapeHtml(currentRunId)}</code>；共 ${events.length} 条事件。每条事件同时标明流程阶段、发生时间、动作和结果。</div><div class="timeline">${eventRows || '<div class="muted">暂无事件记录</div>'}</div></section>
<h2>审计触发与版本变更</h2><p class="section-intro">这里专门回答“审计何时触发、哪些用例版本变了、哪些业务规则变了、影响了哪些用例、是否需要重新验证”。没有事件时明确显示未发生，而不是推断没有变化。</p><section class="panel"><div class="metrics"><div class="metric"><div class="metric-title">审计触发</div><div class="metric-value">${scenarioSummary.auditStarted}</div><div class="metric-hint">审计开始事件</div></div><div class="metric"><div class="metric-title">用例变更</div><div class="metric-value">${scenarioSummary.caseChanges}</div><div class="metric-hint">新增、更新或指纹变化</div></div><div class="metric"><div class="metric-title">规则评估</div><div class="metric-value">${scenarioSummary.ruleDecisions}</div><div class="metric-hint">业务规则决策事件</div></div><div class="metric"><div class="metric-title">需重新验证</div><div class="metric-value">${scenarioSummary.revalidation}</div><div class="metric-hint">规则或用例变化触发</div></div><div class="metric"><div class="metric-title">阻断/延期</div><div class="metric-value">${scenarioSummary.blockedOrDeferred}</div><div class="metric-hint">不能直接得出通过结论</div></div></div><h3>用例版本变更</h3>${caseChangeRows ? `<div class="table-wrap"><table><thead><tr><th>时间</th><th>事件</th><th>用例</th><th>变更内容</th><th>前后指纹</th><th>后续动作</th></tr></thead><tbody>${caseChangeRows}</tbody></table></div>` : '<div class="notice">本次没有记录用例版本变更事件。</div>'}<h3>业务规则变更与评估</h3>${businessRuleRows ? `<div class="table-wrap"><table><thead><tr><th>时间</th><th>规则</th><th>决策</th><th>影响用例</th><th>规则前后指纹</th><th>审批/重新验证</th></tr></thead><tbody>${businessRuleRows}</tbody></table></div>` : '<div class="notice">本次没有记录业务规则评估或变更事件。</div>'}</section>
<h2>步骤记录健康</h2><p class="section-intro">这里核对每个可见流程步骤是否实时写入“开始”和“结束”事件。步骤记录用于过程复盘，不替代业务操作收据、断言收据或清理收据。</p><section class="panel"><div class="metrics"><div class="metric"><div class="metric-title">应记录步骤</div><div class="metric-value">${stepCoverage.expected}</div><div class="metric-hint">收到的步骤开始事件</div></div><div class="metric"><div class="metric-title">已闭合步骤</div><div class="metric-value">${stepCoverage.completed}</div><div class="metric-hint">有对应结束事件</div></div><div class="metric"><div class="metric-title">步骤覆盖率</div><div class="metric-value">${stepCoverage.coveragePercent}%</div><div class="metric-hint">闭合步骤 ÷ 开始步骤</div></div><div class="metric"><div class="metric-title">缺少开始</div><div class="metric-value">${stepCoverage.orphanTerminals}</div><div class="metric-hint">只有结束、没有开始</div></div><div class="metric"><div class="metric-title">缺少结束</div><div class="metric-value">${stepCoverage.unclosed}</div><div class="metric-hint">开始后未收到结束</div></div><div class="metric"><div class="metric-title">重复记录</div><div class="metric-value">${stepCoverage.duplicates}</div><div class="metric-hint">同一步骤重复开始或结束</div></div></div>${stepCoverage.byCase.length ? `<h3>按用例查看</h3><div class="table-wrap"><table><thead><tr><th>用例</th><th>应记录步骤</th><th>已闭合</th><th>覆盖率</th><th>缺少开始</th><th>缺少结束</th><th>状态</th></tr></thead><tbody>${stepCoverage.byCase.map((item) => `<tr><td>${escapeHtml(item.caseId)}</td><td>${item.expected}</td><td>${item.completed}</td><td>${item.coveragePercent}%</td><td>${item.orphanTerminals}</td><td>${item.unclosed}</td><td><span class="badge ${item.unclosed || item.orphanTerminals ? 'danger' : 'success'}">${item.unclosed || item.orphanTerminals ? '需补齐' : '完整'}</span></td></tr>`).join('')}</tbody></table></div>` : '<div class="muted">当前运行没有可见步骤事件。</div>'}</section>
<h2>其他运行场景</h2><p class="section-intro">除正常通过外，以下场景单独统计，避免把“跳过、阻断、重试、环境失败、跨系统暂缓”误解为业务失败或业务通过。</p><section class="panel"><dl><dt>审计阻断</dt><dd>${scenarioSummary.auditBlocked} 次；通常表示证据、权限、上下文或门禁不满足。</dd><dt>用例跳过/延期</dt><dd>${scenarioSummary.skippedOrDeferred} 次；表示未执行或跨系统验证暂缓，不改变用例本身结论。</dd><dt>失败事件</dt><dd>${scenarioSummary.failures} 次；需结合事件阶段判断是业务、自动化、证据还是环境问题。</dd><dt>重试事件</dt><dd>${scenarioSummary.retries} 次；保留原事件关联，不覆盖第一次尝试。</dd><dt>瞬时失败</dt><dd>${scenarioSummary.transientFailures} 次；按重试规则处理，不能直接归类为产品缺陷。</dd><dt>报告生成</dt><dd>${scenarioSummary.reportGenerated} 次；报告生成成功不代表业务用例通过。</dd></dl></section>
<h2>本次验证与清理结论</h2><p class="section-intro">用途：回答“验证了多少项、数据是否清理干净、是否触发用例纠正”。以下数字只属于当前运行 <code>${escapeHtml(currentRunId)}</code>。</p><section class="panel"><div class="purpose"><strong>本次结论：</strong>${assertionCount ? `记录 ${assertionCount} 条断言；` : '未提供断言明细；'}${residueCases === 0 ? '接口和页面均未发现测试数据残留。' : `有 ${residueCases} 条用例存在清理残留。`}</div><dl><dt>断言记录</dt><dd>${assertionCount} 条；每条应包含期望、实际、观察渠道和判断结果</dd><dt>上下文检查</dt><dd>${contextGuardCount} 条；确认路由、语言、角色和租户正确</dd><dt>清理对象</dt><dd>${cleanupObjectCount} 个；${residueCases === 0 ? '当前没有检测到残留' : `有 ${residueCases} 个用例需要处置`}</dd><dt>用例纠正</dt><dd>触发 ${correctionCounts.triggered} 次，启动 ${correctionCounts.started} 次，完成 ${correctionCounts.completed} 次，阻断 ${correctionCounts.blocked} 次</dd></dl>${assertionRows.length ? `<h3>断言明细</h3><div class="table-wrap"><table><thead><tr><th>用例</th><th>验证项</th><th>期望</th><th>实际</th><th>观察渠道/判断依据</th><th>比较结果</th></tr></thead><tbody>${assertionRows.join('')}</tbody></table></div>` : '<div class="notice">当前账本未提供断言明细；这不代表业务已通过，需结合标准执行收据判断。</div>'}</section>
<h2>纠正事件</h2><section class="panel">${correctionRows ? `<div class="table-wrap"><table><thead><tr><th>事件</th><th>用例</th><th>原因/动作</th><th>变更字段</th><th>状态</th></tr></thead><tbody>${correctionRows}</tbody></table></div>` : '<div class="muted">本次运行没有纠正事件。</div>'}</section>
<h2>清理对象明细</h2><section class="panel">${cleanupRows ? `<div class="table-wrap"><table><thead><tr><th>用例</th><th>对象</th><th>业务身份</th><th>服务端编号</th><th>接口/页面残留</th><th>清理操作</th><th>尝试次数/结果</th></tr></thead><tbody>${cleanupRows}</tbody></table></div>` : '<div class="muted">本次运行没有登记清理对象。</div>'}</section>
<h2>日志健康</h2><section class="panel"><dl><dt>全量历史哈希链</dt><dd><span class="badge ${reportHealth.hashClass}">${escapeHtml(reportHealth.hashText)}</span>；校验范围 ${escapeHtml(String(result.integrity?.count ?? '未知'))} 条追加事件</dd><dt>当前运行事件序号</dt><dd>${escapeHtml(reportHealth.sequenceText)}</dd><dt>当前运行事件唯一性</dt><dd>${escapeHtml(reportHealth.duplicateText)}</dd><dt>当前运行操作生命周期</dt><dd>${escapeHtml(reportHealth.lifecycleText)}</dd><dt>当前运行数量对账</dt><dd>${events.length} 条当前事件 / 摘要 ${result.summary.auditEvents} 条</dd></dl>${reportHealth.diagnostics.length ? `<div class="notice warn">${reportHealth.diagnostics.map(escapeHtml).join('<br>')}</div>` : ''}</section>
<h2>字段说明</h2><section class="panel"><dl><dt>用例编号</dt><dd>用于唯一定位一条测试用例，编号保留原样以便与自动化和证据账本对应。</dd><dt>运行编号</dt><dd>用于区分每次执行，便于从报告追溯到对应日志。</dd><dt>变更指纹</dt><dd>数据内容的不可逆校验值，用于确认前后内容是否变化；不能还原原始数据。</dd><dt>事件日志</dt><dd>机器日志用于程序校验；中文可读日志用于人工查看，两者一一对应。</dd><dt>接口残留 / 页面残留</dt><dd>分别表示通过接口查询和页面观察到的测试数据残留数量。</dd><dt>文件格式</dt><dd>CSV 适合表格分析，PDF 适合归档，网页报告适合浏览，JSON/JSONL 适合程序核对。</dd></dl></section>
<h2>证据产物</h2><section class="panel"><p><a href="audit-overview.html">运行总览</a> · <a href="audit-cases.html">逐案证据</a> · <a href="audit-events.html">事件日志</a></p><dl><dt>机器日志（JSONL）</dt><dd><code>${escapeHtml(result.eventLogPath)}</code></dd><dt>中文可读日志</dt><dd><code>${escapeHtml(result.artifacts?.readableLog ?? '未生成')}</code></dd><dt>证据账本（JSON）</dt><dd>${jsonLinks}</dd><dt>中文表格（CSV）</dt><dd><code>${escapeHtml(result.artifacts?.csv ?? '未生成')}</code></dd><dt>打印版网页（另存为 PDF）</dt><dd><code>${escapeHtml(result.artifacts?.printHtml ?? '未生成')}</code></dd><dt>PDF 归档</dt><dd><code>${escapeHtml(result.artifacts?.pdf ?? '未生成（可用打印版网页导出）')}</code></dd></dl></section>
<details class="panel"><summary>查看脱敏报告数据</summary><pre id="report-data">${escapeHtml(JSON.stringify({ result, cases, events }, null, 2))}</pre></details>
<div class="footer">本报告仅负责可视化展示；用例状态和通过资格仍由公共状态裁决器及标准执行收据决定。打印按钮可将当前报告另存为 PDF。</div>
</main><script>
(function(){const q=(s)=>document.querySelector(s);const rows=[...document.querySelectorAll('#case-table tbody tr[data-case-id]')];function apply(){const text=(q('#case-search').value||'').toLowerCase();const status=q('#case-status').value;const change=q('#case-change').value;rows.forEach(r=>{const okText=!text||r.dataset.search.includes(text);const okStatus=!status||r.dataset.status===status;const okChange=!change||r.dataset.change===change;r.dataset.hidden=String(!(okText&&okStatus&&okChange));});}['#case-search','#case-status','#case-change'].forEach((s)=>q(s).addEventListener('input',apply));const csv=q('#download-csv');if(csv)csv.addEventListener('click',()=>{const lines=[['用例编号','审计状态','执行结果','操作次数','变更字段','是否有清理残留'].join(',')];rows.filter(r=>r.dataset.hidden!=='true').forEach(r=>{const cells=[...r.querySelectorAll(':scope>td')].slice(0,6).map(c=>'"'+(c.innerText||'').replace(/"/g,'""').replaceAll(String.fromCharCode(10),' ')+'"');lines.push(cells.join(','));});const blob=new Blob(['\\ufeff'+lines.join('\\n')],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='audit-report.csv';a.click();URL.revokeObjectURL(a.href);});})();
</script></body></html>\n`;
}

function collectCases(ledgers: JsonRecord[]): Array<JsonRecord & { caseId: string; auditStatus: string; executionStatus: string; changed: boolean; residue: boolean; operationCount: number; assertionCount: number; contextGuardCount: number; cleanupObjectCount: number; durationMs: number }> {
  const byId = new Map<string, JsonRecord>();
  for (const ledger of ledgers) {
    const completeness = asRecord(ledger.auditCompleteness);
    for (const item of asArray(completeness.cases)) {
      const record = asRecord(item); const id = String(record.caseId ?? '');
      if (id) byId.set(id, { ...(byId.get(id) ?? {}), ...record });
    }
    for (const item of asArray(ledger.cases)) {
      const record = asRecord(item); const id = String(record.caseId ?? '');
      if (id) byId.set(id, { ...(byId.get(id) ?? {}), ...record });
    }
  }
  return [...byId.entries()].map(([caseId, record]) => {
    const runtime = asRecord(record.runtimeEvidence); const ops = asArray(runtime.operationReceipts).map(asRecord);
    const cleanup = asRecord(runtime.cleanup); const objects = asArray(cleanup.objects).map(asRecord);
    const assertions = asArray(runtime.assertionReceipts);
    const contextGuards = asArray(runtime.contextGuardReceipts);
    const changed = Boolean(runtime.mutationObserved) || ops.some((op) => Boolean(op.dataChanged));
    const residue = objects.some((item) => Number(item.apiResidueCount ?? 0) > 0 || Number(item.uiResidueCount ?? 0) > 0 || item.outcome !== 'verified-zero');
    const durationMs = ops.reduce((total, op) => total + Number(op.durationMs ?? 0), 0);
    return { ...record, caseId, auditStatus: String(record.status ?? asRecord(record.auditCompleteness).status ?? 'unknown'), executionStatus: String(ops[0]?.status ?? (record.status === 'complete' ? 'passed' : 'not-executed')), changed, residue, operationCount: ops.length, assertionCount: assertions.length, contextGuardCount: contextGuards.length, cleanupObjectCount: objects.length, durationMs };
  });
}

function renderCase(item: JsonRecord & { caseId: string; auditStatus: string; executionStatus: string; changed: boolean; residue: boolean; operationCount: number; assertionCount: number; contextGuardCount: number; cleanupObjectCount: number; durationMs: number }): string {
  const runtime = asRecord(item.runtimeEvidence); const ops = asArray(runtime.operationReceipts).map(asRecord); const cleanup = asRecord(runtime.cleanup); const objects = asArray(cleanup.objects).map(asRecord); const timings = asArray(runtime.executionTimings).map(asRecord);
  const missing = asArray(asRecord(item.auditCompleteness).missing).map(String);
  const fields = [...new Set(ops.flatMap((op) => asArray(op.changedFields).map(String)))];
  const statusClass = item.auditStatus === 'complete' ? 'success' : item.auditStatus === 'excluded' ? 'excluded' : 'warning';
  const search = [item.caseId, item.auditStatus, item.executionStatus, ...fields, ...ops.map((op) => String(op.operationKey ?? ''))].join(' ').toLowerCase();
  const diffDetails = ops.map((op) => renderOperationDiff(op)).join('') || '<span class="muted">无结构化Diff</span>';
  const detail = `<details><summary>查看 ${escapeHtml(item.caseId)} 详情</summary><dl><dt>操作时间线</dt><dd>${ops.map((op) => `${escapeHtml(String(op.title ?? op.operationKey ?? '未命名'))} · ${escapeHtml(String(op.startedAt ?? ''))} · ${escapeHtml(String(op.durationMs ?? '-'))}毫秒`).join('<br>') || '<span class="muted">无操作收据</span>'}</dd><dt>阶段耗时（技术计时）</dt><dd>${timings.map((timing) => `${escapeHtml(String(timing.phase ?? '阶段'))}：${escapeHtml(String(timing.durationMs ?? '-'))}毫秒（${escapeHtml(String(timing.status ?? ''))}）`).join('<br>') || '<span class="muted">未提供阶段计时</span>'}</dd><dt>断言记录</dt><dd>${item.assertionCount} 条；详情见标准证据账本</dd><dt>上下文检查</dt><dd>${item.contextGuardCount} 条</dd><dt>数据变更</dt><dd>${diffDetails}</dd><dt>清理结果</dt><dd>${objects.map((obj) => `${escapeHtml(String(obj.entityType ?? '对象'))} / ${escapeHtml(String(obj.serverId ?? ''))} · 接口残留 ${escapeHtml(String(obj.apiResidueCount ?? '-'))} · 页面残留 ${escapeHtml(String(obj.uiResidueCount ?? '-'))} · ${cleanupLabel(String(obj.outcome ?? 'unknown'))}`).join('<br>') || '<span class="muted">未声明清理</span>'}</dd><dt>缺失项</dt><dd>${missing.join(', ') || '<span class="muted">无</span>'}</dd></dl></details>`;
  return `<tr data-case-id="${escapeHtml(item.caseId)}" data-status="${escapeHtml(item.auditStatus)}" data-change="${item.changed ? 'changed' : 'unchanged'}" data-search="${escapeHtml(search)}"><td class="case-id">${escapeHtml(item.caseId)}${detail}</td><td><span class="badge ${statusClass}">${escapeHtml(auditStatusLabel(item.auditStatus))}</span></td><td>${escapeHtml(executionStatusLabel(item.executionStatus))}</td><td>${item.operationCount}</td><td>${fields.map((field) => `<span class="pill changed">${escapeHtml(field)}</span>`).join('') || '<span class="muted">—</span>'}</td><td><span class="pill ${missing.length ? 'dirty' : 'clean'}">${missing.length ? `缺 ${missing.length} 项` : '证据完整'}</span> <span class="pill ${item.residue ? 'dirty' : 'clean'}">${item.residue ? '有残留' : '零残留'}</span><br><span class="muted">${formatDuration(item.durationMs)}</span></td></tr>`;
}

function renderOperationDiff(operation: JsonRecord): string {
  const fields = asArray(operation.changedFields).map(String);
  if (fields.length === 0 && operation.beforeFingerprint == null && operation.afterFingerprint == null) return '';
  const details = asRecord(operation.details);
  const before = details.before ?? details.beforeValue;
  const after = details.after ?? details.afterValue;
  const values = before !== undefined || after !== undefined
    ? `<br>修改前：<code>${escapeHtml(JSON.stringify(before ?? null))}</code><br>修改后：<code>${escapeHtml(JSON.stringify(after ?? null))}</code>`
    : '<br><span class="muted">收据未提供原始快照，仅展示指纹和字段路径</span>';
  return `${fields.map((field) => `<span class="pill changed">${escapeHtml(field)}</span>`).join('')}${values}<br><span class="muted">变更前指纹=${escapeHtml(String(operation.beforeFingerprint ?? '—'))}；变更后指纹=${escapeHtml(String(operation.afterFingerprint ?? '—'))}</span>`;
}

function renderEvent(event: JsonRecord): string {
  const outcome = String(event.outcome ?? ''); const details = asRecord(event.details);
  const subject = event.caseId ? String(event.caseId) : `运行编号：${String(event.runId ?? '全局事件')}`;
  const description = details.title ? String(details.title) : event.caseId ? '业务操作' : '系统事件';
  return `<div class="event ${outcome === 'success' ? 'success' : outcome === 'failed' ? 'failed' : ''}"><div><span class="badge info">${escapeHtml(phaseLabel(event))}</span></div><div class="event-time">${escapeHtml(String(event.occurredAt ?? ''))}</div><div class="event-type">${escapeHtml(eventTypeLabel(String(event.eventType ?? 'unknown')))}</div><div><strong>${escapeHtml(subject)}</strong><br><span class="muted">${escapeHtml(description)}</span></div><div><span class="badge ${outcome === 'success' ? 'success' : outcome === 'failed' ? 'danger' : 'info'}">${escapeHtml(outcomeLabel(outcome || 'record'))}</span></div></div>`;
}

function phaseLabel(event: JsonRecord): string {
  const type = String(event.eventType ?? '');
  const details = asRecord(event.details);
  const explicit = String(details.phase ?? '');
  if (explicit) return ({ initialize: '准备阶段', seed: '准备测试数据', 'action-readiness': '操作前检查', 'context-guard': '环境检查', capability: '业务操作', assertion: '结果验证', cleanup: '数据清理', close: '运行收口' } as Record<string, string>)[explicit] ?? explicit;
  const stepKind = String(details.stepKind ?? '');
  if (stepKind) return ({ 'business-operation': '业务操作', assertion: '结果验证', cleanup: '数据清理', 'context-guard': '环境检查', environment: '准备阶段', 'data-preparation': '准备测试数据', 'precondition-check': '操作前检查', technical: '技术辅助' } as Record<string, string>)[stepKind] ?? stepKind;
  if (type === 'run.started' || type === 'case.started') return '准备阶段';
  if (type.startsWith('operation.') || type.startsWith('step.')) return '业务操作';
  if (type.startsWith('assertion.') || type === 'evidence.recorded') return '结果验证';
  if (type.startsWith('cleanup.')) return '数据清理';
  if (type.startsWith('correction.')) return '用例纠正';
  if (type.startsWith('business-rule.')) return '业务规则评估';
  if (type.startsWith('case.')) return '用例版本变更';
  if (type.startsWith('audit.')) return '审计控制';
  if (type === 'run.completed' || type === 'case.completed' || type === 'report.generated') return '运行收口';
  return '流程记录';
}

function statusLabel(status: string): string { return ({'audit-complete':'审计完成','audit-incomplete':'审计不完整','compiled':'已编译未执行','blocked':'执行阻断'} as Record<string,string>)[status] ?? status; }
function auditStatusLabel(status: string): string { return ({complete:'完整',incomplete:'不完整',excluded:'已排除'} as Record<string,string>)[status] ?? status; }
function executionStatusLabel(status: string): string { return ({passed:'通过',failed:'失败',skipped:'已跳过','not-executed':'未执行',started:'执行中'} as Record<string,string>)[status] ?? status; }
function modeLabel(mode: string): string { return ({reference:'参考验证',flow:'流程执行'} as Record<string,string>)[mode] ?? mode; }
function outcomeLabel(outcome: string): string { return ({success:'成功',failed:'失败',blocked:'阻断',skipped:'跳过',cancelled:'已取消',record:'记录'} as Record<string,string>)[outcome] ?? outcome; }
function cleanupLabel(outcome: string): string { return ({'verified-zero':'已确认无残留',residue:'存在残留',failed:'清理失败'} as Record<string,string>)[outcome] ?? outcome; }
function eventTypeLabel(type: string): string { return ({'run.started':'运行开始','run.completed':'运行完成','case.started':'用例开始','case.completed':'用例完成','case.created':'用例创建','case.updated':'用例更新','case.fingerprint_changed':'用例版本指纹变化','audit.started':'审计开始','audit.completed':'审计完成','step.started':'步骤开始','step.completed':'步骤完成','step.failed':'步骤失败','step.interrupted':'步骤中断','operation.started':'操作开始','operation.called':'操作完成','evidence.recorded':'证据记录','report.generated':'报告生成','business-rule.evaluation.started':'业务规则评估开始','business-rule.decision':'业务规则决策','business-rule.evaluation.completed':'业务规则评估完成','correction.candidate':'发现待纠正项','correction.approved':'纠正已批准','correction.started':'开始纠正','correction.completed':'纠正完成','correction.blocked':'纠正阻断'} as Record<string,string>)[type] ?? type; }

function renderAssertions(item: JsonRecord & { caseId: string }): string[] {
  const runtime = asRecord(item.runtimeEvidence);
  return asArray(runtime.assertionReceipts).map((value) => {
    const assertion = asRecord(value);
    const status = String(assertion.status ?? 'unknown');
    const badge = status === 'verified' ? 'success' : 'danger';
    const actual = assertion.actualStatus === 'unobserved'
      ? `未观察：${String(assertion.unobservedReason ?? '原因未提供')}`
      : JSON.stringify(assertion.actualValue ?? null);
    return `<tr><td>${escapeHtml(item.caseId)}</td><td>${escapeHtml(String(assertion.claimId ?? ''))}</td><td><code>${escapeHtml(JSON.stringify(assertion.expectedValue ?? null))}</code></td><td><code>${escapeHtml(actual)}</code></td><td>${escapeHtml(String(assertion.observationChannel ?? '未提供'))} / ${escapeHtml(String(assertion.authority ?? '未提供'))}</td><td><span class="badge ${badge}">${escapeHtml(String(assertion.comparison ?? status))}</span></td></tr>`;
  });
}

function renderCaseChanges(events: JsonRecord[]): string {
  return events.filter((event) => ['case.created', 'case.updated', 'case.fingerprint_changed'].includes(String(event.eventType ?? ''))).map((event) => {
    const details = asRecord(event.details);
    const changed = asArray(details.changedFields ?? event.changedFields).map(String);
    const before = event.beforeFingerprint ?? details.beforeFingerprint;
    const after = event.afterFingerprint ?? details.afterFingerprint;
    const next = details.revalidationRequired === true || details.revalidationRequired === 'true' ? '需要重新验证' : String(details.action ?? details.nextAction ?? '按当前规则继续');
    return `<tr><td>${escapeHtml(String(event.occurredAt ?? ''))}</td><td>${escapeHtml(eventTypeLabel(String(event.eventType ?? '')))}</td><td><code>${escapeHtml(String(event.caseId ?? details.caseId ?? '未关联'))}</code></td><td>${changed.map((field) => `<span class="pill changed">${escapeHtml(field)}</span>`).join('') || escapeHtml(String(details.reason ?? details.title ?? '记录版本变化'))}</td><td><span class="muted">前：</span><code>${escapeHtml(String(before ?? '未提供'))}</code><br><span class="muted">后：</span><code>${escapeHtml(String(after ?? '未提供'))}</code></td><td>${escapeHtml(next)}</td></tr>`;
  }).join('');
}

function renderBusinessRuleChanges(events: JsonRecord[]): string {
  return events.filter((event) => String(event.eventType ?? '').startsWith('business-rule.')).map((event) => {
    const details = asRecord(event.details);
    const ruleId = String(details.ruleId ?? event.ruleId ?? '未提供');
    const decision = String(details.decision ?? details.eventRole ?? '规则评估');
    const linked = asArray(details.linkedCaseIds).map(String);
    const before = event.beforeFingerprint ?? details.beforeRuleFingerprint;
    const after = event.afterFingerprint ?? details.afterRuleFingerprint;
    const approval = asRecord(details.approvalRef);
    const proof = details.executionProof ? `执行证明：${executionProofLabel(String(details.executionProof))}` : '';
    const revalidation = decision === 'revalidation-required' ? '需要重新验证' : proof || '按决策处理';
    return `<tr><td>${escapeHtml(String(event.occurredAt ?? ''))}</td><td><code>${escapeHtml(ruleId)}</code></td><td><span class="badge ${decision === 'conflict-detected' || decision === 'revalidation-required' ? 'danger' : decision === 'formal-rule-updated' ? 'success' : 'info'}">${escapeHtml(businessRuleDecisionLabel(decision))}</span><br><span class="muted">${escapeHtml(String(details.decisionReason ?? ''))}</span></td><td>${linked.map((id) => `<span class="pill">${escapeHtml(id)}</span>`).join('') || '<span class="muted">未关联用例</span>'}</td><td><span class="muted">前：</span><code>${escapeHtml(String(before ?? '未提供'))}</code><br><span class="muted">后：</span><code>${escapeHtml(String(after ?? '未提供'))}</code></td><td>${escapeHtml(revalidation)}${approval.approvedBy ? `<br>审批人：${escapeHtml(String(approval.approvedBy))}<br>审批时间：${escapeHtml(String(approval.approvedAt ?? '未提供'))}` : ''}</td></tr>`;
  }).join('');
}

function businessRuleDecisionLabel(value: string): string {
  return ({ 'no-change': '无变化', 'candidate-created': '创建候选规则', 'conflict-detected': '发现规则冲突', 'revalidation-required': '需要重新验证', 'formal-rule-updated': '正式规则已更新', 'historical-import': '历史导入', started: '规则评估开始', completed: '规则评估完成' } as Record<string, string>)[value] ?? value;
}

function executionProofLabel(value: string): string {
  return ({ 'passed-complete': '已通过且证据完整', 'not-required': '不需要', missing: '缺少执行证明', 'historical-unavailable': '历史不可用' } as Record<string, string>)[value] ?? value;
}

function summarizeOtherScenarios(events: JsonRecord[]): { auditStarted: number; caseChanges: number; ruleDecisions: number; revalidation: number; blockedOrDeferred: number; auditBlocked: number; skippedOrDeferred: number; failures: number; retries: number; transientFailures: number; reportGenerated: number } {
  const type = (event: JsonRecord) => String(event.eventType ?? '');
  const details = (event: JsonRecord) => asRecord(event.details);
  return {
    auditStarted: events.filter((event) => ['audit.started', 'run.started'].includes(type(event))).length,
    caseChanges: events.filter((event) => ['case.created', 'case.updated', 'case.fingerprint_changed'].includes(type(event))).length,
    ruleDecisions: events.filter((event) => type(event) === 'business-rule.decision').length,
    revalidation: events.filter((event) => type(event) === 'business-rule.decision' && details(event).decision === 'revalidation-required' || details(event).revalidationRequired === true).length,
    blockedOrDeferred: events.filter((event) => ['blocked', 'skipped'].includes(String(event.outcome ?? '')) || details(event).deferred === true).length,
    auditBlocked: events.filter((event) => ['audit.completed', 'run.completed'].includes(type(event)) && String(event.outcome ?? '') === 'blocked').length,
    skippedOrDeferred: events.filter((event) => ['skipped', 'deferred'].includes(String(event.outcome ?? '')) || details(event).deferred === true).length,
    failures: events.filter((event) => ['failed', 'blocked'].includes(String(event.outcome ?? ''))).length,
    retries: events.filter((event) => event.retryOfEventId || Number(event.attempt ?? 1) > 1).length,
    transientFailures: events.filter((event) => details(event).transientFailure === true || event.transientFailure === true).length,
    reportGenerated: events.filter((event) => type(event) === 'report.generated').length,
  };
}

function renderCorrections(events: JsonRecord[]): string {
  return events.filter((event) => String(event.eventType ?? '').startsWith('correction.')).map((event) => {
    const details = asRecord(event.details);
    const fields = asArray(details.changedFields ?? event.changedFields).map(String);
    const before = event.beforeFingerprint ?? details.beforeFingerprint;
    const after = event.afterFingerprint ?? details.afterFingerprint;
    const affected = asArray(details.affectedCaseIds ?? details.affectedCases).map(String);
    const identity = affected.length ? affected.join(', ') : String(event.caseId ?? details.caseId ?? '未关联');
    return `<tr><td><code>${escapeHtml(String(event.eventId ?? ''))}</code><br><span class="muted">${escapeHtml(String(event.correctionId ?? details.correctionId ?? ''))}</span></td><td>${escapeHtml(identity)}</td><td>${escapeHtml(String(details.reason ?? details.action ?? details.title ?? '未提供'))}<br><span class="muted">变更前指纹=${escapeHtml(String(before ?? '—'))}；变更后指纹=${escapeHtml(String(after ?? '—'))}</span></td><td>${fields.map((field) => `<span class="pill changed">${escapeHtml(field)}</span>`).join('') || '<span class="muted">—</span>'}</td><td><span class="badge info">${escapeHtml(eventTypeLabel(String(event.eventType ?? '')))}</span></td></tr>`;
  }).join('');
}

function renderCleanup(cases: Array<JsonRecord & { caseId: string }>): string {
  return cases.flatMap((item) => {
    const runtime = asRecord(item.runtimeEvidence);
    const cleanup = asRecord(runtime.cleanup);
    return asArray(cleanup.objects).map(asRecord).map((obj) => `<tr><td>${escapeHtml(item.caseId)}</td><td>${escapeHtml(String(obj.entityType ?? '对象'))}</td><td>${escapeHtml(String(obj.businessIdentity ?? ''))}</td><td>${escapeHtml(String(obj.serverId ?? ''))}</td><td>接口 ${escapeHtml(String(obj.apiResidueCount ?? '-'))} / 页面 ${escapeHtml(String(obj.uiResidueCount ?? '-'))}</td><td>${escapeHtml(String(obj.cleanupOperationKey ?? '未提供'))}</td><td>${escapeHtml(String(obj.cleanupAttempt ?? '-'))} / ${escapeHtml(cleanupLabel(String(obj.outcome ?? 'unknown')))}</td></tr>`);
  }).join('');
}

function renderTrendDashboard(history: AuditRunHistory[]): string {
  if (!history.length) return '<div class="muted">暂无可绘制的运行趋势。</div>';
  const chronological = [...history].reverse();
  return `<div class="trend-grid">${[
    renderTrendChart(chronological, 'eventCount', '事件数量趋势', '#2563eb', (value) => `${value} 条`),
    renderTrendChart(chronological, 'dataChanges', '数据变更趋势', '#7c3aed', (value) => `${value} 次`),
    renderTrendChart(chronological, 'failures', '失败事件趋势', '#b42318', (value) => `${value} 个`),
    renderTrendChart(chronological, 'durationMs', '运行耗时趋势', '#08783e', formatDuration),
    renderStepCoverageTrend(chronological),
  ].join('')}</div>`;
}

function renderStepCoverageTrend(history: AuditRunHistory[]): string {
  const values = history.map((run) => run.stepCount === undefined ? null : Number(run.stepCoveragePercent ?? 0));
  const width = 900; const height = 150; const left = 28; const right = 18; const top = 14; const bottom = 30;
  const usableWidth = width - left - right; const usableHeight = height - top - bottom;
  const points = values.map((value, index) => value === null ? null : ({ x: left + (history.length === 1 ? usableWidth / 2 : index / (history.length - 1) * usableWidth), y: top + usableHeight - value / 100 * usableHeight, value, run: history[index] }));
  const segments: string[] = []; let segment: string[] = [];
  for (const point of points) { if (!point) { if (segment.length) segments.push(segment.join(' ')); segment = []; } else segment.push(`${point.x.toFixed(1)},${point.y.toFixed(1)}`); }
  if (segment.length) segments.push(segment.join(' '));
  const polylines = segments.map((line) => `<polyline points="${line}" fill="none" stroke="#0891b2" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const dots = points.filter((point): point is NonNullable<typeof point> => Boolean(point)).map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" fill="#0891b2"><title>${escapeHtml(point.run.runId)}：${point.value}%</title></circle>`).join('');
  const unknowns = values.filter((value) => value === null).length;
  return `<article class="trend-card"><h3>步骤覆盖率趋势</h3><div class="muted">按运行观察步骤是否完整闭合；目标为 100%。${unknowns ? ` ${unknowns} 次运行未采集步骤数据。` : ''}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="步骤覆盖率趋势"><line class="axis" x1="${left}" y1="${top + usableHeight}" x2="${width - right}" y2="${top + usableHeight}"/><line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + usableHeight}"/>${polylines}${dots}<text x="${left}" y="${height - 7}" font-size="11" fill="currentColor">${escapeHtml(shortRunId(history[0].runId))}</text><text x="${width - right}" y="${height - 7}" text-anchor="end" font-size="11" fill="currentColor">${escapeHtml(shortRunId(history[history.length - 1].runId))}</text></svg></article>`;
}

function renderTrendChart(
  history: AuditRunHistory[],
  key: 'eventCount' | 'dataChanges' | 'failures' | 'durationMs',
  title: string,
  color: string,
  format: (value: number) => string,
): string {
  const values = history.map((run) => run[key]);
  const actualMaximum = Math.max(0, ...values);
  const scaleMaximum = Math.max(1, actualMaximum);
  const width = 900; const height = 150; const left = 28; const right = 18; const top = 14; const bottom = 30;
  const usableWidth = width - left - right; const usableHeight = height - top - bottom;
  const points = values.map((value, index) => {
    const x = left + (history.length === 1 ? usableWidth / 2 : (index / (history.length - 1)) * usableWidth);
    const y = top + usableHeight - (value / scaleMaximum) * usableHeight;
    return { x, y, value, run: history[index] };
  });
  const polyline = points.map((point) => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const dots = points.map((point) => `<circle cx="${point.x.toFixed(1)}" cy="${point.y.toFixed(1)}" r="4" fill="${color}"><title>${escapeHtml(point.run.runId)}：${escapeHtml(format(point.value))}</title></circle>`).join('');
  const first = history[0]; const last = history[history.length - 1];
  return `<article class="trend-card"><h3>${escapeHtml(title)}</h3><div class="muted">共 ${history.length} 次运行；最高 ${escapeHtml(format(actualMaximum))}</div><svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeHtml(title)}"><line class="axis" x1="${left}" y1="${top + usableHeight}" x2="${width - right}" y2="${top + usableHeight}"/><line class="axis" x1="${left}" y1="${top}" x2="${left}" y2="${top + usableHeight}"/><polyline points="${polyline}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>${dots}<text x="${left}" y="${height - 7}" font-size="11" fill="currentColor">${escapeHtml(shortRunId(first.runId))}</text><text x="${width - right}" y="${height - 7}" text-anchor="end" font-size="11" fill="currentColor">${escapeHtml(shortRunId(last.runId))}</text></svg></article>`;
}

function shortRunId(runId: string): string {
  return runId.length <= 22 ? runId : `…${runId.slice(-18)}`;
}

function renderHistory(history: AuditRunHistory[], currentRunIds: Set<string>, previousRunId?: string): string {
  if (!history.length) return '<div class="muted">暂无历史运行数据。</div>';
  const latest = history[0]; const previous = history[1];
  const diff = previous ? `<div class="notice">与上一次运行对比：事件数 ${latest.eventCount - previous.eventCount >= 0 ? '+' : ''}${latest.eventCount - previous.eventCount}，数据变更 ${latest.dataChanges - previous.dataChanges >= 0 ? '+' : ''}${latest.dataChanges - previous.dataChanges}，失败事件 ${latest.failures - previous.failures >= 0 ? '+' : ''}${latest.failures - previous.failures}，耗时变化 ${latest.durationMs - previous.durationMs >= 0 ? '+' : ''}${formatDuration(Math.abs(latest.durationMs - previous.durationMs))}</div>` : '';
  return `${diff}<div class="purpose">全部运行都保留事件记录；有独立快照的运行可直接打开归档。早期运行若没有当时的完整账本，只能如实标记为“仅保留事件日志”。步骤覆盖率用于判断过程记录是否完整，不等同于业务通过率；“未采集”不等于 0%。</div><div class="table-wrap"><table><thead><tr><th>运行归属</th><th>运行编号</th><th>时间</th><th>事件数</th><th>步骤覆盖</th><th>数据变更</th><th>失败事件</th><th>耗时</th><th>历史快照</th></tr></thead><tbody>${history.map((run, index) => `<tr class="${currentRunIds.has(run.runId) ? 'history-current' : ''}"><td>${currentRunIds.has(run.runId) ? '<span class="badge info">本次</span>' : run.runId === previousRunId ? '<span class="badge warning">上次</span>' : `历史第 ${history.length - index} 次`}</td><td><code>${escapeHtml(run.runId)}</code></td><td>${escapeHtml(String(run.occurredAt ?? ''))}</td><td>${run.eventCount}</td><td>${run.stepCount === undefined ? '<span class="muted">未采集</span>' : `${run.stepCount} 步 / ${run.stepCoveragePercent ?? '—'}%${run.unclosedSteps ? `（未闭合 ${run.unclosedSteps}）` : ''}`}</td><td>${run.dataChanges}</td><td>${run.failures}</td><td>${escapeHtml(formatDuration(run.durationMs))}</td><td>${run.reportPath ? `<a href="${escapeHtml(pathToFileHref(run.reportPath))}">打开归档报告</a>` : '<span class="muted">仅保留事件日志</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}

function renderHistoricalRunRecords(events: JsonRecord[], currentRunIds: Set<string>, previousRunId?: string): string {
  const groups = new Map<string, JsonRecord[]>();
  for (const event of events) {
    const runId = String(event.runId ?? '');
    if (!runId) continue;
    groups.set(runId, [...(groups.get(runId) ?? []), event]);
  }
  const ordered = [...groups.entries()].sort(([, left], [, right]) => String(right[0]?.occurredAt ?? '').localeCompare(String(left[0]?.occurredAt ?? '')));
  if (!ordered.length) return '<div class="muted">暂无运行事件档案。</div>';
  return `<h3>逐次运行事件档案</h3><p class="muted">共 ${ordered.length} 次运行、${events.length} 条事件。默认展开本次运行，其余运行可按需展开。</p>${ordered.map(([runId, runEvents]) => {
    const isCurrent = currentRunIds.has(runId);
    const failures = runEvents.filter((event) => event.outcome === 'failed' || event.outcome === 'blocked').length;
    const changes = runEvents.filter((event) => event.dataChanged === true).length;
    return `<details ${isCurrent ? 'open' : ''}><summary><span class="run-summary">${isCurrent ? '<span class="badge info">本次</span>' : runId === previousRunId ? '<span class="badge warning">上次</span>' : '<span class="badge">历史</span>'}<code>${escapeHtml(runId)}</code><span>${runEvents.length} 条事件</span><span>${changes} 次变更</span><span>${failures} 个失败</span></span></summary><div class="table-wrap run-events"><table><thead><tr><th>流程阶段</th><th>发生时间</th><th>事件类型</th><th>用例/运行</th><th>事件内容</th><th>结果</th><th>事件编号</th></tr></thead><tbody>${runEvents.map(renderHistoricalEvent).join('')}</tbody></table></div></details>`;
  }).join('')}`;
}

function renderHistoricalEvent(event: JsonRecord): string {
  const details = asRecord(event.details);
  const content = details.title ?? details.operationKey ?? details.sourceKind ?? (event.dataChanged === true ? '记录到数据变更' : '流程事件');
  return `<tr><td>${escapeHtml(phaseLabel(event))}</td><td>${escapeHtml(String(event.occurredAt ?? ''))}</td><td>${escapeHtml(eventTypeLabel(String(event.eventType ?? 'unknown')))}</td><td>${escapeHtml(String(event.caseId ?? event.runId ?? ''))}</td><td>${escapeHtml(String(content))}${event.dataChanged === true ? '<br><span class="pill changed">发生数据变更</span>' : ''}</td><td>${escapeHtml(outcomeLabel(String(event.outcome ?? 'record')))}</td><td><code>${escapeHtml(String(event.eventId ?? ''))}</code></td></tr>`;
}

function pathToFileHref(filePath: string): string {
  return `file:///${filePath.replaceAll('\\', '/').replaceAll('#', '%23').replaceAll(' ', '%20')}`;
}

function renderExecutionContext(result: AuditReportResult): string {
  const context = result.executionContext ?? {};
  const entries = Object.entries({ applicationId: result.applicationId, systemId: result.systemId, ...context })
    .filter(([, value]) => value !== undefined && value !== null && value !== '');
  const labels: Record<string, string> = { applicationId: '应用编号', systemId: '系统编号', environmentId: '环境', locale: '语言', roleId: '角色', tenantScope: '租户范围', featureFlagFingerprint: '功能开关指纹' };
  return entries.map(([key, value]) => `<span class="pill">${escapeHtml(labels[key] ?? key)}=${escapeHtml(typeof value === 'string' ? value : JSON.stringify(value))}</span>`).join('') || '<span class="muted">未提供</span>';
}

function evaluateReportHealth(result: AuditReportResult, events: JsonRecord[]): { hashClass: string; hashText: string; sequenceText: string; duplicateText: string; lifecycleText: string; diagnostics: string[] } {
  const diagnostics: string[] = [];
  const sequences = events.map((event) => Number(event.eventSequence)).filter(Number.isFinite);
  const sequenceOk = sequences.length === 0 || sequences.every((value, index) => index === 0 || value > sequences[index - 1]);
  if (!sequenceOk) diagnostics.push('事件序号存在倒序或重复，请检查追加日志。');
  const eventIds = events.map((event) => String(event.eventId ?? '')).filter(Boolean);
  const duplicateCount = eventIds.length - new Set(eventIds).size;
  if (duplicateCount > 0) diagnostics.push(`发现 ${duplicateCount} 个重复事件编号。`);
  const starts = new Set(events.filter((event) => event.eventType === 'operation.started').map((event) => `${event.runId}:${event.caseId}:${asRecord(event.details).operationKey ?? event.eventId}`));
  const calls = new Set(events.filter((event) => event.eventType === 'operation.called').map((event) => `${event.runId}:${event.caseId}:${asRecord(event.details).operationKey ?? event.eventId}`));
  const lifecycleOk = [...starts].every((key) => calls.has(key));
  if (!lifecycleOk) diagnostics.push('存在未形成终态的 operation.started 事件。');
  const countOk = events.length === result.summary.auditEvents;
  if (!countOk) diagnostics.push(`当前事件数量 ${events.length} 与摘要 ${result.summary.auditEvents} 不一致。`);
  const valid = result.integrity?.valid !== false && sequenceOk && duplicateCount === 0 && lifecycleOk && countOk;
  return { hashClass: valid ? 'success' : 'danger', hashText: result.integrity?.valid === false ? '校验失败' : valid ? '通过（当前事件集）' : '存在问题', sequenceText: sequenceOk ? '连续/递增' : '异常', duplicateText: duplicateCount === 0 ? '无重复事件编号' : `${duplicateCount} 个重复`, lifecycleText: lifecycleOk ? '开始/完成已配对' : '存在未闭合操作', diagnostics };
}

type StepCoverage = {
  expected: number;
  completed: number;
  coveragePercent: number;
  orphanTerminals: number;
  unclosed: number;
  duplicates: number;
  byCase: Array<{ caseId: string; expected: number; completed: number; coveragePercent: number; orphanTerminals: number; unclosed: number }>;
};

/** 仅统计当前运行的 step.* 事件，避免把历史事件混入分母。 */
function analyzeStepCoverage(events: JsonRecord[]): StepCoverage {
  const starts = events.filter((event) => event.eventType === 'step.started');
  const terminals = events.filter((event) => ['step.completed', 'step.failed', 'step.interrupted'].includes(String(event.eventType)));
  const keyOf = (event: JsonRecord): string => {
    const details = asRecord(event.details);
    return [event.runId, event.caseId, details.stepId ?? event.parentEventId ?? event.eventId].map(String).join(':');
  };
  const startKeys = new Set<string>();
  let duplicates = 0;
  for (const event of starts) { const key = keyOf(event); if (startKeys.has(key)) duplicates += 1; startKeys.add(key); }
  const terminalKeys = new Set<string>();
  for (const event of terminals) { const key = keyOf(event); if (terminalKeys.has(key)) duplicates += 1; terminalKeys.add(key); }
  const completed = [...startKeys].filter((key) => terminalKeys.has(key)).length;
  const unclosed = [...startKeys].filter((key) => !terminalKeys.has(key)).length;
  const orphanTerminals = [...terminalKeys].filter((key) => !startKeys.has(key)).length;
  const byCaseMap = new Map<string, JsonRecord[]>();
  for (const event of [...starts, ...terminals]) {
    const caseId = String(event.caseId ?? '未关联用例');
    byCaseMap.set(caseId, [...(byCaseMap.get(caseId) ?? []), event]);
  }
  const byCase = [...byCaseMap.entries()].map(([caseId, items]) => {
    const localStarts = items.filter((event) => event.eventType === 'step.started');
    const localTerminals = items.filter((event) => ['step.completed', 'step.failed', 'step.interrupted'].includes(String(event.eventType)));
    const localStartKeys = new Set(localStarts.map(keyOf));
    const localTerminalKeys = new Set(localTerminals.map(keyOf));
    const localCompleted = [...localStartKeys].filter((key) => localTerminalKeys.has(key)).length;
    const localUnclosed = [...localStartKeys].filter((key) => !localTerminalKeys.has(key)).length;
    const localOrphans = [...localTerminalKeys].filter((key) => !localStartKeys.has(key)).length;
    return { caseId, expected: localStarts.length, completed: localCompleted, coveragePercent: localStarts.length ? Math.round(localCompleted / localStarts.length * 100) : 0, orphanTerminals: localOrphans, unclosed: localUnclosed };
  }).sort((a, b) => a.caseId.localeCompare(b.caseId));
  return { expected: starts.length, completed, coveragePercent: starts.length ? Math.round(completed / starts.length * 100) : 0, orphanTerminals, unclosed, duplicates, byCase };
}

function aggregateCorrections(events: JsonRecord[]): { triggered: number; started: number; completed: number; blocked: number; affectedCases: number } {
  const affected = new Set<string>(); let triggered = 0; let started = 0; let completed = 0; let blocked = 0;
  for (const event of events) {
    if (event.eventType === 'correction.candidate') { triggered += 1; if (event.caseId) affected.add(String(event.caseId)); }
    if (event.eventType === 'correction.started') started += 1;
    if (event.eventType === 'correction.completed') completed += 1;
    if (event.eventType === 'correction.blocked') blocked += 1;
  }
  return { triggered, started, completed, blocked, affectedCases: affected.size };
}

function aggregateDuration(events: JsonRecord[], cases: Array<{ durationMs: number }>): number {
  const eventDuration = events.reduce((total, event) => total + Number(event.durationMs ?? 0), 0);
  return eventDuration > 0 ? eventDuration : cases.reduce((total, item) => total + item.durationMs, 0);
}

function formatDuration(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  if (value < 1000) return `${Math.round(value)} ms`;
  return `${(value / 1000).toFixed(2)} s`;
}

function asRecord(value: unknown): JsonRecord { return value && typeof value === 'object' && !Array.isArray(value) ? value as JsonRecord : {}; }
function asArray(value: unknown): unknown[] { return Array.isArray(value) ? value : []; }
function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, (item) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[item]!); }
