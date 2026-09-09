import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';

export type CapabilityIndexConfig = {
  version: 1;
  groups: Array<{
    key: string;
    title: string;
    description: string;
    roots: string[];
  }>;
  exclude?: string[];
};

export type CapabilityModule = {
  file: string;
  classes: Array<{ name: string; methods: string[] }>;
  functions: string[];
  variables: string[];
  types: string[];
  fixtureKeys: string[];
};

export type CapabilityIndex = {
  version: 1;
  groups: Array<CapabilityIndexConfig['groups'][number] & { modules: CapabilityModule[] }>;
};

export function buildCapabilityIndex(input: {
  projectRoot: string;
  config: CapabilityIndexConfig;
}): CapabilityIndex {
  const projectRoot = path.resolve(input.projectRoot);
  return {
    version: 1,
    groups: input.config.groups.map((group) => ({
      ...group,
      modules: collectFiles(projectRoot, group.roots, input.config.exclude ?? [])
        .map((file) => analyzeCapabilityModule(projectRoot, file))
        .filter((module) => capabilityCount(module) > 0)
        .sort((left, right) => left.file.localeCompare(right.file)),
    })),
  };
}

export function renderCapabilityIndexMarkdown(index: CapabilityIndex): string {
  const lines = [
    '# 项目能力索引',
    '',
    '> 本文件由公共测试自动化平台根据项目配置生成，请勿手工修改。',
    '',
    '## 总览',
    '',
    '| 分类 | 模块数 | 对外能力数 |',
    '| --- | ---: | ---: |',
    ...index.groups.map((group) => `| ${group.title} | ${group.modules.length} | ${group.modules.reduce((sum, module) => sum + capabilityCount(module), 0)} |`),
    '',
  ];
  for (const group of index.groups) {
    lines.push(`## ${group.title}`, '', group.description, '', '| 模块 | 对外能力 |', '| --- | --- |');
    for (const module of group.modules) {
      const capabilities = [
        ...module.fixtureKeys.map((name) => `fixture:${name}`),
        ...module.classes.flatMap((item) => item.methods.length > 0
          ? item.methods.map((method) => `${item.name}.${method}()`)
          : [item.name]),
        ...module.functions.map((name) => `${name}()`),
        ...module.variables,
        ...module.types.map((name) => `type:${name}`),
      ];
      lines.push(`| [\`${escapeCell(module.file)}\`](../${module.file}) | ${capabilities.map((item) => `\`${escapeCell(item)}\``).join('、')} |`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

export function analyzeCapabilityModule(projectRoot: string, file: string): CapabilityModule {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const result: CapabilityModule = {
    file: path.relative(projectRoot, file).replaceAll('\\', '/'),
    classes: [], functions: [], variables: [], types: [], fixtureKeys: [],
  };
  for (const statement of sourceFile.statements) {
    if (ts.isClassDeclaration(statement) && statement.name && exported(statement)) {
      result.classes.push({
        name: statement.name.text,
        methods: statement.members.filter(ts.isMethodDeclaration)
          .filter((member) => !member.modifiers?.some((modifier) => (
            modifier.kind === ts.SyntaxKind.PrivateKeyword || modifier.kind === ts.SyntaxKind.ProtectedKeyword
          )))
          .map((member) => member.name.getText(sourceFile))
          .sort(),
      });
    } else if (ts.isFunctionDeclaration(statement) && statement.name && exported(statement)) {
      result.functions.push(statement.name.text);
    } else if (ts.isVariableStatement(statement) && exported(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) result.variables.push(declaration.name.text);
      }
    } else if ((ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement) || ts.isEnumDeclaration(statement))
      && exported(statement)) {
      result.types.push(statement.name.text);
    }
  }
  const visit = (node: ts.Node): void => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === 'extend' && node.arguments[0] && ts.isObjectLiteralExpression(node.arguments[0])) {
      for (const property of node.arguments[0].properties) {
        if ('name' in property && property.name) result.fixtureKeys.push(property.name.getText(sourceFile));
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  result.classes.sort((left, right) => left.name.localeCompare(right.name));
  result.functions = unique(result.functions);
  result.variables = unique(result.variables.filter((name) => !['test', 'expect'].includes(name)));
  result.types = unique(result.types);
  result.fixtureKeys = unique(result.fixtureKeys);
  return result;
}

function collectFiles(projectRoot: string, roots: readonly string[], excludes: readonly string[]): string[] {
  const files: string[] = [];
  const normalizedExcludes = excludes.map((item) => item.replaceAll('\\', '/'));
  for (const root of roots) {
    const absolute = path.resolve(projectRoot, root);
    if (!fs.existsSync(absolute)) continue;
    walk(absolute);
  }
  return [...new Set(files)].sort();

  function walk(directory: string): void {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (['node_modules', 'output', 'test-results'].includes(entry.name)) continue;
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(projectRoot, absolute).replaceAll('\\', '/');
      if (normalizedExcludes.some((item) => relative === item || relative.startsWith(`${item}/`))) continue;
      if (entry.isDirectory()) walk(absolute);
      else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) files.push(absolute);
    }
  }
}

function exported(node: ts.Node & { modifiers?: ts.NodeArray<ts.ModifierLike> }): boolean {
  return node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword) === true;
}

function capabilityCount(module: CapabilityModule): number {
  return module.fixtureKeys.length + module.functions.length + module.variables.length + module.types.length
    + module.classes.reduce((sum, item) => sum + Math.max(1, item.methods.length), 0);
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function escapeCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\r', '').replaceAll('\n', ' ');
}
