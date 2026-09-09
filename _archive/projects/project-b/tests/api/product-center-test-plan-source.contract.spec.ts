import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  productCenterCanonicalTestCaseRoot,
  productCenterCompletedTestPlanRoot,
  productCenterUnlandedTestPlanRoot,
} from '../../utils/product-center-test-plan-source';
import {
  loadProductCenterTestPlanRegistry,
  productCenterRegisteredSourceMaterialPath,
  productCenterRegisteredTestPlanRoot,
} from '../../utils/product-center-test-plan-registry';

const projectRoot = path.resolve(__dirname, '../..');
const workspaceRoot = path.resolve(projectRoot, '..');
const infoRoot = path.join(workspaceRoot, 'Merchant Center Info');

const registry = loadProductCenterTestPlanRegistry(projectRoot);

test.describe('商品中心测试方案统一来源目录', () => {
  test('每个模块应只有一份权威用例正文且来源资料独立存放', async () => {
    for (const source of registry.plans) {
      const moduleRoot = productCenterRegisteredTestPlanRoot(infoRoot, source);
      const markdownFiles = fs.readdirSync(moduleRoot).filter((fileName) => /\.md$/i.test(fileName));
      expect(markdownFiles, source.module).toEqual([source.formalFileName]);
      expect(fs.existsSync(productCenterRegisteredSourceMaterialPath(infoRoot, source))).toBe(true);
    }
  });

  test('新增方案应只通过注册表进入统一来源检查', async () => {
    expect(registry.plans.map((plan) => plan.planId)).toEqual([
      'product-center-item',
      'product-center-group',
      'product-center-seasoning',
      'product-center-tag',
      'product-center-image',
    ]);
    expect(new Set(registry.plans.map((plan) => plan.runnerId))).toEqual(new Set(['item', 'group', 'remaining']));
  });

  test('已完成目录应只包含已有脚本绑定的状态索引', async () => {
    const completedRoot = productCenterCompletedTestPlanRoot(infoRoot);
    const entries = fs.readdirSync(completedRoot, { withFileTypes: true });
    expect(entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name)).toEqual([]);
    expect(entries.filter((entry) => entry.isFile()).map((entry) => entry.name).sort()).toEqual([
      'README.md',
      'index.json',
      'index.md',
    ]);
    const index = JSON.parse(fs.readFileSync(path.join(completedRoot, 'index.json'), 'utf8')) as {
      cases: Array<{ status: string; scriptPath?: string }>;
    };
    expect(index.cases.length).toBeGreaterThan(0);
    expect(index.cases.every((item) => item.status === 'landed' && Boolean(item.scriptPath))).toBe(true);
  });

  test('未落地目录不得复制权威用例正文', async () => {
    const unlandedRoot = productCenterUnlandedTestPlanRoot(infoRoot);
    const files = listTextFiles(unlandedRoot).map((filePath) => path.basename(filePath));
    expect(files.filter((fileName) => /正式测试用例\.md$/i.test(fileName))).toEqual([]);
    expect(files).toContain('index.json');
    expect(files).toContain('index.md');
  });

  test('旧商品管理测试方案目录不得继续保留源文件', async () => {
    const legacyRoot = path.join(infoRoot, '坎昆商品中心PRD测试方案', '商品管理');
    const legacyFiles = fs.existsSync(legacyRoot)
      ? fs.readdirSync(legacyRoot, { withFileTypes: true }).filter((entry) => entry.isFile())
      : [];
    expect(legacyFiles.map((entry) => entry.name)).toEqual([]);
  });

  test('活动资产不得引用旧目录或已完成目录中的用例正文', async () => {
    const guardedRoots = [
      path.join(projectRoot, 'scripts'),
      path.join(projectRoot, 'utils'),
      path.join(projectRoot, 'tests', 'api'),
      path.join(projectRoot, 'contracts', 'product-center'),
      path.join(workspaceRoot, 'deliverables', 'product-center-group'),
      productCenterCanonicalTestCaseRoot(infoRoot),
    ];
    const violations = guardedRoots.flatMap(listTextFiles).flatMap((filePath) => {
      const content = fs.readFileSync(filePath, 'utf8');
      return /坎昆商品中心PRD测试方案[\\/]商品管理[\\/][1-5]\./.test(content)
        || /00-待转换测试方案[\\/]已完成[\\/][^\r\n"']+-正式测试用例\.md/.test(content)
        ? [path.relative(workspaceRoot, filePath).replaceAll('\\', '/')]
        : [];
    });
    expect(violations).toEqual([]);
  });
});

function listTextFiles(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(root, entry.name);
    if (entry.isDirectory()) return listTextFiles(entryPath);
    return /\.(?:json|md|ts)$/.test(entry.name) ? [entryPath] : [];
  });
}
