import { expect, test } from '@playwright/test';
import {
  planAllureResultRetention,
  type AllureResultFile,
} from '../../utils/allure-result-retention';

test.describe('Allure 本地结果保留治理合同', () => {
  test('应按完整日期组清理过期结果并始终保留当天结果', async () => {
    const files = [
      file('old-a.json', '2026-07-24T10:00:00+08:00', 20),
      file('old-b.json', '2026-07-25T10:00:00+08:00', 20),
      file('recent.json', '2026-07-26T10:00:00+08:00', 20),
      file('today.json', '2026-07-27T10:00:00+08:00', 20),
    ];

    const plan = planAllureResultRetention(files, new Date('2026-07-27T18:00:00+08:00'), {
      retainDays: 2,
      maxFiles: 10,
      maxBytes: 1_000,
    });

    expect(plan.deleteFiles.map((item) => item.relativePath)).toEqual(['old-a.json', 'old-b.json']);
    expect(plan.keepFiles.map((item) => item.relativePath)).toEqual(['recent.json', 'today.json']);
    expect(plan.deleteDays).toEqual(['2026-07-24', '2026-07-25']);
  });

  test('超过文件或容量上限时应继续淘汰最旧完整日期但不得删除当天', async () => {
    const files = [
      file('day-1-a.json', '2026-07-26T08:00:00+08:00', 80),
      file('day-1-b.json', '2026-07-26T09:00:00+08:00', 80),
      file('today-a.json', '2026-07-27T08:00:00+08:00', 80),
      file('today-b.json', '2026-07-27T09:00:00+08:00', 80),
    ];

    const plan = planAllureResultRetention(files, new Date('2026-07-27T18:00:00+08:00'), {
      retainDays: 2,
      maxFiles: 3,
      maxBytes: 250,
    });

    expect(plan.deleteDays).toEqual(['2026-07-26']);
    expect(plan.remainingFiles).toBe(2);
    expect(plan.remainingBytes).toBe(160);
    expect(plan.keepFiles.every((item) => item.day === '2026-07-27')).toBe(true);
  });

  test('无历史文件时应输出 no-op 计划', async () => {
    const files = [file('today.json', '2026-07-27T10:00:00+08:00', 10)];
    const plan = planAllureResultRetention(files, new Date('2026-07-27T18:00:00+08:00'));

    expect(plan.deleteFiles).toEqual([]);
    expect(plan.deleteDays).toEqual([]);
    expect(plan.remainingFiles).toBe(1);
  });

  test('当天结果自身超过硬上限时应淘汰最旧文件并保留最新结果', async () => {
    const files = [
      file('today-oldest.json', '2026-07-27T08:00:00+08:00', 80),
      file('today-middle.json', '2026-07-27T09:00:00+08:00', 80),
      file('today-newer.json', '2026-07-27T10:00:00+08:00', 80),
      file('today-latest.json', '2026-07-27T11:00:00+08:00', 80),
    ];

    const plan = planAllureResultRetention(files, new Date('2026-07-27T18:00:00+08:00'), {
      retainDays: 2,
      maxFiles: 3,
      maxBytes: 250,
    });

    expect(plan.deleteFiles.map((item) => item.relativePath)).toEqual(['today-oldest.json']);
    expect(plan.keepFiles.map((item) => item.relativePath)).toEqual([
      'today-middle.json',
      'today-newer.json',
      'today-latest.json',
    ]);
    expect(plan.limitSatisfied).toBe(true);
  });
});

function file(relativePath: string, modifiedAt: string, sizeBytes: number): AllureResultFile {
  return {
    relativePath,
    modifiedAt: new Date(modifiedAt),
    sizeBytes,
  };
}
