import fs from 'node:fs';
import path from 'node:path';
import {
  buildHumanRuleEvidenceManifest,
  validateTestEvidenceManifest,
} from '../utils/test-evidence-governance';

const projectRoot = path.resolve(__dirname, '..');
const evidenceRoot = path.resolve(projectRoot, '..', 'Merchant Center Info/00-待转换测试方案/来源资料/商品中心-商品管理-组/人工确认证据/20260819');
const relativeRoot = 'Merchant Center Info/00-待转换测试方案/来源资料/商品中心-商品管理-组/人工确认证据/20260819';
const caseIdsByFile: Record<string, string[]> = {
  '01-SPEC-006-规格名称必填.png': ['TC-GRP-SPEC-006'],
  '02-SPEC-016-关联规格不可删除.png': ['TC-GRP-SPEC-016'],
  '03-TASTE-005-口味名称必填.png': ['TC-GRP-TASTE-005'],
  '04-TASTE-004-口味组名称必填.png': ['TC-GRP-TASTE-004'],
  '05-TASTE-010-关联口味删除变更确认.png': ['TC-GRP-TASTE-010', 'TC-GRP-TASTE-011'],
  '06-TASTE-021-单口味不可删除.png': ['TC-GRP-TASTE-009'],
  '07-TASTE-009-多口味删除变更确认.png': ['TC-GRP-TASTE-009'],
  '08-MTH-005-做法名称必填.png': ['TC-GRP-MTH-005'],
  '09-MTH-008-关联做法删除变更确认.png': ['TC-GRP-MTH-008'],
  '10-MTH-009-未引用做法删除变更确认.png': ['TC-GRP-MTH-009'],
  '11-MTH-020-单做法不可删除.png': ['TC-GRP-MTH-009'],
  '12-MTH-010-未引用做法组删除确认.png': ['TC-GRP-MTH-010'],
  '13-ADD-008-零数量有商品可保存.png': ['TC-GRP-ADD-008'],
  '14-ADD-008-无商品确定置灰.png': ['TC-GRP-ADD-008'],
  '15-ADD-013-未引用加料明细删除确认.png': ['TC-GRP-ADD-013'],
  '16-ADD-014-被引用加料明细删除确认.png': ['TC-GRP-ADD-014'],
  '17-ADD-014-单加料明细不可删除.png': ['TC-GRP-ADD-014'],
  '18-ADD-016-变更预览与影响商品统计.png': ['TC-GRP-ADD-016'],
  '19-ADD-016-引用商品同步终态.png': ['TC-GRP-ADD-016'],
  '20-PKG-009-单套餐商品不可删除.png': ['TC-GRP-PKG-009'],
  '21-PKG-009-新增套餐商品.png': ['TC-GRP-PKG-009'],
  '22-PKG-009-保存确认影响范围.png': ['TC-GRP-PKG-009'],
  '23-PKG-009-引用套餐商品同步终态.png': ['TC-GRP-PKG-009'],
  '24-PKG-044-随心配价格来源.png': ['TC-GRP-PKG-044'],
};

const workspaceRoot = path.resolve(projectRoot, '..');
const manifest = buildHumanRuleEvidenceManifest({
  workspaceRoot,
  evidenceRoot,
  relativeRoot,
  caseIdsByFile,
});
const errors = validateTestEvidenceManifest(manifest, workspaceRoot);
if (errors.length > 0) throw new Error(errors.join('\n'));
const outputPath = path.join(projectRoot, 'contracts/product-center/group/product-center-group-human-evidence-manifest.json');
fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
process.stdout.write(`${outputPath}\n`);
