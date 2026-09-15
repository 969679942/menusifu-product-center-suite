import fs from 'node:fs';
import path from 'node:path';
import { fingerprintSystemTestAssetValue } from '../../Test Automation Platform/src/automation/system-test/system-test-asset-lifecycle';

const canonicalSources = [
  {
    prefix: 'TC-IMG-',
    relativePath: 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-图片管理/5.商品中心-商品管理-图片管理-正式测试用例.md',
  },
  {
    prefix: 'TC-TAG-',
    relativePath: 'Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-标签管理/4.商品中心-商品管理-标签管理-正式测试用例.md',
  },
] as const;

export function fingerprintProductCenterLegacyCaseById(
  caseId: string,
  workspaceRoot = path.resolve(__dirname, '../..'),
): string {
  const source = canonicalSources.find((item) => caseId.startsWith(item.prefix));
  if (!source) throw new Error(`LEGACY_CASE_SOURCE_UNRESOLVED:${caseId}`);
  const sourcePath = path.join(workspaceRoot, source.relativePath);
  const markdown = fs.readFileSync(sourcePath, 'utf8');
  const section = markdown
    .split(/^### 用例编号：/m)
    .slice(1)
    .find((candidate) => candidate.match(/^([^\r\n]+)/)?.[1]?.trim() === caseId);
  if (!section) throw new Error(`LEGACY_CASE_CANONICAL_SECTION_MISSING:${caseId}`);
  const title = section.match(/^用例标题：([^\r\n]+)/m)?.[1]?.trim();
  if (!title) throw new Error(`LEGACY_CASE_CANONICAL_TITLE_MISSING:${caseId}`);
  return fingerprintSystemTestAssetValue({ caseId, title, section });
}
