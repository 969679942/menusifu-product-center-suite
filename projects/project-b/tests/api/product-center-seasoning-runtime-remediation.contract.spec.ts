import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

type PlanCase = {
  caseId: string;
  dataProfileId: string;
  mutation?: { method: string; operationKey: string };
  seed?: { adapterId: string };
  cleanup?: { adapterId: string };
  actions: string[];
};

type ManifestCase = Pick<PlanCase, 'caseId' | 'dataProfileId'> & {
  executionContextProfile: string;
};

type DataProfile = {
  requiredOperationKeys: string[];
};

const projectRoot = path.resolve(__dirname, '../..');
const systemRoot = path.join(projectRoot, 'systems/merchant-center-product-center-seasoning');

test.describe('调味定向整改运行合同', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(systemRoot, 'test-plan.json'), 'utf8')) as { cases: PlanCase[] };
  const byId = new Map(plan.cases.map((item) => [item.caseId, item]));

  test('manifest 数据档案投影必须与正式计划保持一致', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, 'manifest.json'), 'utf8')) as { cases: ManifestCase[] };
    const manifestById = new Map(manifest.cases.map((item) => [item.caseId, item]));
    for (const item of plan.cases) {
      expect(manifestById.get(item.caseId)?.dataProfileId, item.caseId).toBe(item.dataProfileId);
    }
  });

  test('取消编辑和取消删除必须使用可造数可清理档案', () => {
    for (const caseId of ['TC-FLV-SEA-035', 'TC-FLV-SEA-036']) {
      const item = byId.get(caseId);
      expect(item?.dataProfileId).toBe('seasoning-cancel-reversible');
      expect(item?.seed?.adapterId).toBe('merchant-center.seasoning.seed');
      expect(item?.cleanup?.adapterId).toBe('merchant-center.seasoning.cleanup');
      expect(item?.mutation).toBeUndefined();
    }
  });

  test('调味名称查询只要求实际执行的批量造数操作', () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(systemRoot, 'manifest.json'), 'utf8')) as {
      dataProfiles: Record<string, DataProfile>;
    };
    const item = byId.get('TC-FLV-SEA-007');
    expect(item).toEqual(expect.objectContaining({
      dataProfileId: 'seasoning-search-reversible',
      mutation: { method: 'POST', operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch' },
      seed: { adapterId: 'merchant-center.seasoning.seed' },
      cleanup: { adapterId: 'merchant-center.seasoning.cleanup' },
    }));
    expect(manifest.dataProfiles['seasoning-search-reversible']?.requiredOperationKeys).toEqual([
      'brand-menu:POST /ops-brand/global-modifier/batch',
    ]);
  });

  test('模板二次确认用例必须绑定删除模板而不是编辑模板内容', () => {
    const item = byId.get('TC-FLV-TPL-021');
    expect(item?.mutation).toEqual({
      method: 'DELETE',
      operationKey: 'brand-menu:DELETE /ops-brand/modifier-template/{id}',
    });
    expect(item?.actions.join('')).toContain('删除模板二次确认');
    expect(item?.actions.join('')).not.toContain('删除模板内调味');
  });

  test('模板正向保存必须等待选择弹窗关闭且不得强制点击', () => {
    const pageSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');
    const saveTemplateSource = pageSource.slice(
      pageSource.indexOf('async saveTemplate('),
      pageSource.indexOf("@step('填写调味模板名称并读取规范化值"),
    );
    expect(saveTemplateSource).toContain("await dialog.waitFor({ state: 'hidden' })");
    expect(saveTemplateSource).toContain('await this.templateSaveButton.click()');
    expect(saveTemplateSource).not.toContain('this.templateSaveButton.click({ force: true })');
  });

  test('调味项排序和调味组排序必须使用不同页面与接口合同', () => {
    expect(byId.get('TC-FLV-SEA-040')).toEqual(expect.objectContaining({
      dataProfileId: 'seasoning-edit-reversible',
      mutation: { method: 'PUT', operationKey: 'brand-menu:PUT /ops-brand/global-modifier/{id}' },
    }));
    expect(byId.get('TC-FLV-SEA-041')).toEqual(expect.objectContaining({
      dataProfileId: 'seasoning-sort-reversible',
      mutation: { method: 'PUT', operationKey: 'brand-menu:PUT /ops-brand/global-modifier/sort' },
    }));
    const pageSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');
    const systemSource = fs.readFileSync(path.join(systemRoot, 'tests/system.spec.ts'), 'utf8');
    expect(pageSource).toContain('aria-roledescription="sortable"');
    expect(pageSource).toContain('filter({ has: this.page.locator(sourceInputSelector) })');
    expect(pageSource.match(/dragSortableByPointer\(sourceHandle, targetHandle\)/g)).toHaveLength(2);
    expect(pageSource).toContain("getByRole('button', { name: 'delete', exact: true })");
    expect(pageSource).toContain("getByRole('button', { name: 'holder', exact: true })");
    expect(pageSource).toContain("dialog.getByRole('combobox')");
    expect(pageSource).toContain("locator('.ant-select-dropdown:visible')");
    expect(pageSource).toContain("targetDropdown.getByText(targetGroupName, { exact: true })");
    expect(pageSource).not.toContain('secondaryConfirmationVisible: terminal.dialogVisible');
    expect(systemSource).not.toContain('正式来源要求删除调味项时出现二次确认弹窗');
    expect(systemSource).toContain('const result = await seasoning.deleteOption(optionName);');
    expect(systemSource).toContain('checks.optionAbsent = findFirstSeasoningOptionName(after) !== optionName;');
    expect(systemSource).toContain('const movedOptionId = findOptionId(sourceBefore, source.optionName);');
    expect(systemSource).toContain('requestBody.optionIds.map(Number).includes(movedOptionId)');
    expect(systemSource).toContain("name: 'system-test-runtime-evidence'");
    expect(systemSource).toContain('revealBrandSeasoningGroup(source.name)');
    expect(systemSource).toContain('const optionNames = [`${identity}_OPTION_A`, `${identity}_OPTION_B`]');
    expect(systemSource).toContain('searchBrandSeasoning(sharedIdentityPrefix(source.name, target.name))');
    expect(pageSource).not.toContain("overlay.locator('[draggable=\"true\"]:visible')");
  });

  test('行业调味选择必须按虚拟表格行勾选且不得假设传统 tr', () => {
    expect(byId.get('TC-FLV-SEA-023')).toEqual(expect.objectContaining({
      dataProfileId: 'seasoning-industry-import-reversible',
      mutation: { method: 'POST', operationKey: 'brand-menu:POST /ops-brand/global-modifier/batch' },
    }));
    const pageSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');
    const systemSource = fs.readFileSync(path.join(systemRoot, 'tests/system.spec.ts'), 'utf8');
    expect(pageSource).toContain('expandIndustrySeasoningGroup(groupName)');
    expect(pageSource).toContain("group.locator('div.ant-table-row').filter({");
    expect(pageSource).toContain("rows.nth(index).locator('div.ant-table-cell').nth(1).innerText()");
    expect(pageSource).toContain("row.locator('div.ant-table-cell').nth(1).getByText(optionName, { exact: true })");
    expect(pageSource).toContain("group.locator('div[class^=\"header___\"]').getByRole('button')");
    expect(pageSource).toContain('ancestor::div[contains(@class,"groupItemContainer___")][1]');
    expect(pageSource).toContain('readIndustrySeasoningOptionNames(groupName: string)');
    expect(pageSource).toContain('selectIndustrySeasoning(groupName: string, optionNames: string | readonly string[])');
    expect(systemSource).toContain('checks.secondSelectionAccepted = second.status >= 200 && second.status < 300;');
    expect(systemSource).toContain('checks.finalSetMatchesUnion = sameStringSet(afterSecondOptionNames, afterFirstOptionNames);');
    expect(systemSource).toContain('checks.repeatedOptionDeduplicated');
    expect(systemSource).toContain('checks.singleGroupRecordRetained');
    expect(systemSource).toContain('findSeasoningGroupRecords(afterSecondList, candidate.groupName)');
    expect(systemSource).toContain('matchingGroups[0].id === created.id');
    expect(systemSource).not.toContain('findNamedRecordsByPrefix(afterSecondList, candidate.groupName)');
    expect(systemSource).not.toContain('duplicateFeedbackVisible');
    expect(pageSource).not.toContain("locator('xpath=ancestor::tr[1]')");
    expect(pageSource).not.toContain('ancestor::div[contains(@class,"ant-table-row")][1]');
  });

  test('50项上限必须提交第51项并断言精确提示、拦截通道和服务端未持久化', () => {
    const source = fs.readFileSync(path.join(systemRoot, 'tests/system.spec.ts'), 'utf8');
    const pageSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');
    expect(pageSource).toContain('填写并提交第51个调味项，读取上限拦截结果');
    expect(pageSource).toContain('await this.confirmButton.click()');
    expect(pageSource).toContain("rejectionChannel: mutationCount === 0 ? '前端提交校验' : '服务端拒绝'");
    expect(source).toContain("result.errorTexts.includes('BITEM-11072 : 一个调味组最大仅能添加50个调味')");
    expect(source).toContain('result.beforeRowCount === 50 && result.rowCountAfterAdd === 51');
    expect(source).toContain("result.rejectionChannel === '前端提交校验'");
    expect(source).toContain("result.rejectionChannel === '服务端拒绝' && result.mutationStatus !== undefined");
    expect(source).toContain('checks.serverOptionCountRetained = serverOptionNames.length === 50');
    expect(source).toContain('checks.originalOptionSetRetained = sameStringSet(serverOptionNames, serverOptionNamesBefore)');
    expect(source).toContain('checks.submittedOptionNotPersisted = !serverOptionNames.includes(rejectedOptionName)');
    expect(source).toContain("entityType: 'seasoning-group'");
    expect(source).toContain('changeReceipts: runtimeContext?.changeReceipts ?? []');
    expect(source).toContain('提交后服务端回读仍为原 50 个调味项');
    expect(source).not.toContain('/上限|最大|达到/.test(text)');
  });

  test('再次下发必须对完整门店响应与编辑后模板执行顺序无关的全量比对', () => {
    const source = fs.readFileSync(path.join(systemRoot, 'tests/system.spec.ts'), 'utf8');
    const pageSource = fs.readFileSync(path.join(projectRoot, 'pages/product-center/seasoning-boundary.page.ts'), 'utf8');
    const flowSource = fs.readFileSync(path.join(projectRoot, 'flows/product-center/seasoning-template-redelivery.flow.ts'), 'utf8');
    expect(source).toContain('collectTemplateOptionNames(storeAfterRedelivery)');
    expect(source).toContain('sameStringSet(afterRedeliveryNames, editedTemplateNames)');
    expect(source).toContain('当前再次下发成功，但门店全量回读仍保持旧调味项');
    expect(source).not.toContain('collectTemplateOptionNames(findRecordObjectWithName(storeAfterRedelivery');
    expect(source).toContain('context.templateRedeliveryFlow.execute({');
    expect(flowSource).toContain('async execute(input: SeasoningTemplateRedeliveryInput)');
    expect(flowSource).toContain('await this.seasoningPage.distributeTemplate(');
    expect(flowSource).toContain('await this.seasoningPage.verifyCurrentStoreIdentity(input.targetStore);');
    expect(pageSource).toContain("filter({ hasText: storeId })");
    expect(pageSource).toContain("row.getByText(storeId, { exact: true })");
    expect(pageSource).toContain("const checkbox = row.getByRole('checkbox');");
    expect(pageSource).toContain('() => checkbox.isChecked()');
    expect(pageSource).toContain('target.poiId === storeId && target.poiName === targetStoreName');
    expect(pageSource).toContain("(pathname) => pathname === '/poi/location/seasoning'");
    expect(pageSource).toContain("getByRole('button').filter({ hasText: expectation.storeName })");
    expect(pageSource).toContain("currentStoreButton.getByText(expectation.storeName, { exact: true })");
    expect(pageSource).not.toContain("filter({ has: dialog.getByText(storeId, { exact: true }) })");
    expect(pageSource).not.toContain("getByRole('button', { name: expectation.storeName, exact: true })");
  });
});
