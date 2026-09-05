import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { runReferenceAuditPipeline } from '../../scripts/run-system-test-audit-pipeline';

test('系统无关本地审计夹具应实时产出 v1.1 完整收据和可视报告', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'system-test-audit-reference-'));
  const previousRoot = process.env.SYSTEM_TEST_PROJECT_ROOT;
  try {
    process.env.SYSTEM_TEST_PROJECT_ROOT = root;
    const relativeOutput = 'reference-output';
    const result = await runReferenceAuditPipeline(relativeOutput);
    expect(result).toMatchObject({
      mode: 'reference', status: 'audit-complete', exitCode: 0,
      summary: {
        planned: 2, auditEligible: 1, classifiedExclusions: 1,
        auditComplete: 1, auditIncomplete: 0, invariantSatisfied: true,
      },
    });
    expect(fs.existsSync(result.artifacts.json)).toBe(true);
    expect(fs.existsSync(result.artifacts.html)).toBe(true);
    expect(result.artifacts.csv).toBeTruthy();
    expect(result.artifacts.printHtml).toBeTruthy();
    expect(fs.existsSync(result.artifacts.csv!)).toBe(true);
    expect(fs.existsSync(result.artifacts.printHtml!)).toBe(true);
    if (result.artifacts.pdf) expect(fs.existsSync(result.artifacts.pdf)).toBe(true);
    const html = fs.readFileSync(result.artifacts.html, 'utf8');
    expect(html).toContain('全部运行总览');
    expect(html).toContain('总体结论');
    expect(html).toContain('累计运行规模');
    expect(html).toContain('累计变更与异常');
    expect(html).toContain('历史归档覆盖');
    expect(html).toContain('本次审计结论');
    expect(html).not.toContain('<h3>本次结论</h3>');
    expect(html).toContain('运行趋势图');
    expect(html).toContain('事件数量趋势');
    expect(html).toContain('数据变更趋势');
    expect(html).toContain('失败事件趋势');
    expect(html).toContain('运行耗时趋势');
    expect(html).toContain('步骤覆盖率趋势');
    expect(html).toContain('全部运行记录');
    expect(html).toContain('逐次运行事件档案');
    expect(html).toContain('本次运行身份');
    expect(html).toContain('逐条用例核对');
    expect(html).toContain('本次流程时间线');
    expect(html).toContain('审计触发与版本变更');
    expect(html).toContain('业务规则变更与评估');
    expect(html).toContain('其他运行场景');
    expect(html).toContain('需要重新验证');
    expect(html).toContain('准备阶段');
    expect(html).toContain('业务操作');
    expect(html).toContain('运行收口');
    expect(html).not.toContain('<span class="badge info">close</span>');
    expect(html).toContain('日志健康');
    expect(html).toContain('本次验证与清理结论');
    expect(html).toContain('纠正事件');
    expect(html).toContain('清理对象明细');
    expect(html).toContain('下载 CSV');
    expect(html).toContain('打印 / 另存为 PDF');
    expect(result.archiveDirectory).toBeTruthy();
    expect(result.timing).toEqual(expect.objectContaining({
      durationMs: expect.any(Number),
      phases: expect.objectContaining({
        'load-inputs': expect.objectContaining({ status: 'completed', durationMs: expect.any(Number) }),
        'render-and-write-reports': expect.objectContaining({ status: 'completed', durationMs: expect.any(Number) }),
        pdf: expect.objectContaining({ status: expect.stringMatching(/^(completed|skipped)$/), durationMs: expect.any(Number) }),
        'finalize-reports': expect.objectContaining({ status: 'completed', durationMs: expect.any(Number) }),
        archive: expect.objectContaining({ status: 'completed', durationMs: expect.any(Number) }),
      }),
    }));
    const persistedResult = JSON.parse(fs.readFileSync(result.artifacts.json, 'utf8'));
    expect(persistedResult.timing).toEqual(result.timing);
    expect(fs.existsSync(path.join(result.archiveDirectory!, 'audit-pipeline-report.html'))).toBe(true);
    expect(fs.existsSync(path.join(result.archiveDirectory!, 'audit-pipeline-result.json'))).toBe(true);
    expect(fs.existsSync(path.join(result.archiveDirectory!, 'audit-events.jsonl'))).toBe(true);
    expect(fs.existsSync(path.join(result.archiveDirectory!, 'evidence-ledger.json'))).toBe(true);
    if (result.artifacts.pdf) expect(html).toContain('PDF 归档');
    expect(html).toContain('REF-AUDIT-MUTATION-001');
    expect(html).toContain('nested.enabled');
    expect(html).toContain('verified-zero');
    expect(html).toContain('data-invariant');
    expect(html).not.toMatch(/authorization|cookie|access[_-]?token|password/i);
    const currentEventRows = (html.match(/class="event(?: |\")/g) ?? []).length;
    expect(currentEventRows).toBe(result.summary.auditEvents);
    const events = fs.readFileSync(result.eventLogPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line));
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: 'operation.started', caseId: 'REF-AUDIT-MUTATION-001' }),
      expect.objectContaining({ eventType: 'operation.called', dataChanged: true, caseId: 'REF-AUDIT-MUTATION-001' }),
    ]));
    const currentEvents = events.filter((event) => event.runId === result.runIds[0]);
    const eventTypes = currentEvents.map((event) => event.eventType);
    expect(eventTypes.indexOf('step.started')).toBeLessThan(eventTypes.indexOf('operation.started'));
    expect(eventTypes.indexOf('operation.called')).toBeLessThan(eventTypes.indexOf('step.started', eventTypes.indexOf('operation.called') + 1));
    const ledger = JSON.parse(fs.readFileSync(result.evidenceLedgers[0], 'utf8'));
    expect(ledger.cases[0].runtimeEvidence.cleanup.objects[0]).toEqual(expect.objectContaining({
      apiResidueCount: 0, uiResidueCount: 0, outcome: 'verified-zero',
    }));

    const firstRunId = result.runIds[0];
    const firstArchiveHtmlPath = path.join(result.archiveDirectory!, 'audit-pipeline-report.html');
    const firstArchiveHtml = fs.readFileSync(firstArchiveHtmlPath, 'utf8');
    const second = await runReferenceAuditPipeline(relativeOutput);
    const secondHtml = fs.readFileSync(second.artifacts.html, 'utf8');
    expect((secondHtml.match(/class="event(?: |\")/g) ?? []).length).toBe(second.summary.auditEvents);
    expect(secondHtml).toContain(second.runIds[0]);
    expect(secondHtml).toContain(firstRunId);
    expect(secondHtml).toContain(`${firstRunId}:run.started`);
    expect(secondHtml).toContain('上次');
    expect(second.archiveDirectory).not.toBe(result.archiveDirectory);
    expect(fs.existsSync(firstArchiveHtmlPath)).toBe(true);
    expect(fs.readFileSync(firstArchiveHtmlPath, 'utf8')).toBe(firstArchiveHtml);
    expect(firstArchiveHtml).toContain(firstRunId);
    expect(firstArchiveHtml).not.toContain(second.runIds[0]);
    expect(secondHtml).toContain('打开归档报告');
    const archivedResult = JSON.parse(fs.readFileSync(path.join(result.archiveDirectory!, 'audit-pipeline-result.json'), 'utf8'));
    expect(archivedResult.timing).toEqual(result.timing);
  } finally {
    if (previousRoot === undefined) delete process.env.SYSTEM_TEST_PROJECT_ROOT;
    else process.env.SYSTEM_TEST_PROJECT_ROOT = previousRoot;
    fs.rmSync(root, { recursive: true, force: true });
  }
});
