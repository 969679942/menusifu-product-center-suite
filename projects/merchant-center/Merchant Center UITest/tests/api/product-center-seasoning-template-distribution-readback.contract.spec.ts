import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const systemSpecPath = path.resolve(
  process.cwd(),
  'systems/merchant-center-product-center-seasoning/tests/system.spec.ts',
);

test.describe('调味模板异步下发回读合同', () => {
  test('TPL-022 下发被接受后等待门店调味身份再读取断言证据', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');
    const functionStart = source.indexOf('async function runTemplateUiMutationCase(');
    const branchStart = source.indexOf("case 'TC-FLV-TPL-022':", functionStart);
    const branchEnd = source.indexOf('\n    default:', branchStart);
    const branch = source.slice(branchStart, branchEnd);
    const acceptedIndex = branch.indexOf('checks.distributionAccepted = distribution.status >= 200 && distribution.status < 300;');
    const waitIndex = branch.indexOf('await waitForStoreRecord(distributionApi, baseline.name);');
    const readbackIndex = branch.indexOf('storeSeasoningList()', waitIndex);

    expect(functionStart).toBeGreaterThanOrEqual(0);
    expect(branchStart).toBeGreaterThanOrEqual(0);
    expect(branchEnd).toBeGreaterThan(branchStart);
    expect(acceptedIndex).toBeGreaterThanOrEqual(0);
    expect(waitIndex).toBeGreaterThan(acceptedIndex);
    expect(readbackIndex).toBeGreaterThan(waitIndex);
    expect(branch).toContain('checks.storeReadback = Boolean(storeRecord);');
    expect(branch).toContain('const storeRecord = findRecordObjectWithName(storeBody, baseline.name);');
    expect(branch).not.toContain('const storeRecord = findNamedRecord(storeBody, baseline.name);');
    expect(branch).toContain("'brand-menu:GET /ops-poi/global-modifier/list'");
  });

  test('模板创建和门店回读必须产生真实接口执行收据', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');

    expect(source).toContain("'brand-menu:POST /ops-brand/modifier-template'");
    expect(source).toContain("'brand-menu:GET /ops-poi/global-modifier/list'");
    expect(source).toContain('withObservedExecutableOperation(');
    expect(source).toContain('finishExecutableOperation(operation, \'passed\');');
    expect(source).toContain('finishExecutableOperation(operation, \'failed\');');
  });

  test('门店终态等待复用已审计的精确身份轮询', () => {
    const source = fs.readFileSync(systemSpecPath, 'utf8');
    const helperStart = source.indexOf('async function waitForStoreRecord(');
    const helperEnd = source.indexOf('async function waitForDistributionJob(', helperStart);
    const helper = source.slice(helperStart, helperEnd);

    expect(helperStart).toBeGreaterThanOrEqual(0);
    expect(helperEnd).toBeGreaterThan(helperStart);
    expect(helper).toContain('const body = await api.storeSeasoningList();');
    expect(helper).toContain('const record = findNamedRecord(body, identity);');
    expect(helper).toContain('if (record) return record;');
  });
});
