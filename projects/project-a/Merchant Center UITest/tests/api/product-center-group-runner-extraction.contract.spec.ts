import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { expect, test } from '@playwright/test';
import { readProductCenterGroupObservedDifferenceEvidence } from '../../utils/product-center-group-runner';
import { ObservedProductDifferenceError } from '../../adapters/product-center/product-center-group-combo-v2-support';

const projectRoot = path.resolve(__dirname, '../..');

test('组入口必须保留拆分模块抛出的产品差异证据身份', () => {
  const evidence = { caseId: 'contract-only', actualMessages: ['合同观察'] };
  const failure = new ObservedProductDifferenceError('合同诊断', evidence);
  expect(readProductCenterGroupObservedDifferenceEvidence(failure)).toBe(evidence);
  expect(readProductCenterGroupObservedDifferenceEvidence(new Error('技术错误'))).toBeNull();
  expect(readProductCenterGroupObservedDifferenceEvidence({ evidence })).toBeNull();
});

test('套餐拆分模块不得反向导入组入口或形成循环依赖', () => {
  const root = 'utils/product-center-group-runner.ts';
  const cases = 'adapters/product-center/product-center-group-combo-v2-cases.ts';
  const support = 'adapters/product-center/product-center-group-combo-v2-support.ts';
  const edges = new Map<string, string[]>();
  for (const file of [root, cases, support]) {
    const content = fs.readFileSync(path.join(projectRoot, file), 'utf8');
    const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
    const imports = source.statements.filter(ts.isImportDeclaration)
      .map((node) => (node.moduleSpecifier as ts.StringLiteral).text)
      .filter((specifier) => specifier.startsWith('.'))
      .map((specifier) => path.posix.normalize(path.posix.join(path.posix.dirname(file), specifier + '.ts')));
    edges.set(file, imports);
  }
  expect(edges.get(root)).toEqual(expect.arrayContaining([cases, support]));
  expect(edges.get(cases)).toContain(support);
  expect(edges.get(cases)).not.toContain(root);
  expect(edges.get(support)).not.toContain(root);
  expect(edges.get(support)).not.toContain(cases);
});
