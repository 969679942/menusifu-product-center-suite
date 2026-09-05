import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { resolveProductCenterGroupToolchain } from './product-center-group-execution-fingerprint';

export type ProductCenterGroupCaseFingerprintBinding = {
  caseId: string;
  handlerId: string | null;
  bindingFingerprint: string;
  generationAllowed: boolean;
  blockClassification?: string | null;
};

export type ProductCenterGroupCaseFingerprint = {
  caseId: string;
  handlerId: string;
  bindingFingerprint: string;
  implementationFingerprint: string;
  fingerprint: string;
  dependencyFiles: string[];
  dependencySymbols: string[];
  dependencyFragmentFingerprints: Array<{ id: string; sha256: string }>;
};

export type ProductCenterGroupCaseFingerprintManifest = {
  schemaVersion: '1.0.0';
  generatedAt: string;
  cases: ProductCenterGroupCaseFingerprint[];
};

export type ProductCenterGroupCaseImpact = {
  selectedCaseIds: string[];
  unchangedCaseIds: string[];
  reasons: Array<{
    caseId: string;
    reason: 'missing-baseline' | 'handler-changed' | 'binding-changed' | 'dependency-changed';
    previousFingerprint: string | null;
    currentFingerprint: string;
  }>;
};

const runnerPath = 'utils/product-center-group-runner.ts';
const commonDependencyFiles = [
  'playwright.config.ts',
  'fixtures/product-center.fixture.ts',
  'tests/generated/product-center-group.generated.spec.ts',
  'tests/setup/global.teardown.ts',
  'utils/product-center-application-version.ts',
] as const;

type DependencyGraph = {
  dependencyFiles: string[];
  dependencySymbols: string[];
  fragments: Array<{ id: string; content: string }>;
};

export function buildProductCenterGroupCaseFingerprintManifest(
  projectRoot: string,
  bindings: readonly ProductCenterGroupCaseFingerprintBinding[],
  options: { includeObservedProductDrift?: boolean; includeSourceRecovery?: boolean } = {},
): ProductCenterGroupCaseFingerprintManifest {
  const executable = bindings.filter((binding) => binding.generationAllowed
    || options.includeObservedProductDrift === true && binding.blockClassification === 'observed-product-drift'
    || options.includeSourceRecovery === true && binding.blockClassification === 'source-evidence-blocked');
  const missingHandlers = executable.filter((binding) => !binding.handlerId).map((binding) => binding.caseId);
  if (missingHandlers.length > 0) {
    throw new Error(`可执行组用例缺少 handler：${missingHandlers.join(',')}`);
  }
  const compiler = createDependencyCompiler(projectRoot);
  const graphByHandler = new Map<string, DependencyGraph>();
  const toolchain = resolveProductCenterGroupToolchain(projectRoot);
  const commonFragments = commonDependencyFiles.map((relativePath) => ({
    id: `file:${relativePath}`,
    content: readRequiredFile(projectRoot, relativePath),
  }));
  const cases = executable.map((binding) => {
    const handlerId = binding.handlerId!;
    const graph = graphByHandler.get(handlerId) ?? compiler.compile(handlerId);
    graphByHandler.set(handlerId, graph);
    const fragmentFingerprints = [...commonFragments, ...graph.fragments]
      .map((fragment) => ({ id: fragment.id, sha256: sha256(fragment.content) }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const implementationFingerprint = hashStable({
      schemaVersion: '1.0.0',
      handlerId,
      toolchain,
      fragments: fragmentFingerprints,
    });
    const fingerprint = hashStable({
      schemaVersion: '1.0.0',
      caseId: binding.caseId,
      handlerId,
      bindingFingerprint: binding.bindingFingerprint,
      implementationFingerprint,
    });
    return {
      caseId: binding.caseId,
      handlerId,
      bindingFingerprint: binding.bindingFingerprint,
      implementationFingerprint,
      fingerprint,
      dependencyFiles: [...new Set([...commonDependencyFiles, ...graph.dependencyFiles])].sort(),
      dependencySymbols: graph.dependencySymbols,
      dependencyFragmentFingerprints: fragmentFingerprints,
    };
  }).sort((left, right) => left.caseId.localeCompare(right.caseId));
  return { schemaVersion: '1.0.0', generatedAt: new Date().toISOString(), cases };
}

export function selectImpactedProductCenterGroupCases(
  current: ProductCenterGroupCaseFingerprintManifest,
  baseline: ProductCenterGroupCaseFingerprintManifest | null,
): ProductCenterGroupCaseImpact {
  const baselineByCaseId = new Map(baseline?.cases.map((item) => [item.caseId, item]) ?? []);
  const reasons: ProductCenterGroupCaseImpact['reasons'] = [];
  const unchangedCaseIds: string[] = [];
  for (const currentCase of current.cases) {
    const previous = baselineByCaseId.get(currentCase.caseId);
    if (!previous) {
      reasons.push({
        caseId: currentCase.caseId,
        reason: 'missing-baseline',
        previousFingerprint: null,
        currentFingerprint: currentCase.fingerprint,
      });
      continue;
    }
    if (previous.handlerId !== currentCase.handlerId) {
      reasons.push({
        caseId: currentCase.caseId,
        reason: 'handler-changed',
        previousFingerprint: previous.fingerprint,
        currentFingerprint: currentCase.fingerprint,
      });
      continue;
    }
    if (previous.bindingFingerprint !== currentCase.bindingFingerprint) {
      reasons.push({
        caseId: currentCase.caseId,
        reason: 'binding-changed',
        previousFingerprint: previous.fingerprint,
        currentFingerprint: currentCase.fingerprint,
      });
      continue;
    }
    if (previous.fingerprint !== currentCase.fingerprint) {
      reasons.push({
        caseId: currentCase.caseId,
        reason: 'dependency-changed',
        previousFingerprint: previous.fingerprint,
        currentFingerprint: currentCase.fingerprint,
      });
      continue;
    }
    unchangedCaseIds.push(currentCase.caseId);
  }
  return {
    selectedCaseIds: reasons.map((item) => item.caseId),
    unchangedCaseIds,
    reasons,
  };
}

function createDependencyCompiler(projectRoot: string): { compile(handlerId: string): DependencyGraph } {
  const configPath = ts.findConfigFile(projectRoot, ts.sys.fileExists, 'tsconfig.json');
  if (!configPath) throw new Error(`缺少 TypeScript 配置：${projectRoot}`);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, projectRoot);
  const program = ts.createProgram(parsed.fileNames, parsed.options);
  const checker = program.getTypeChecker();
  const runnerSource = program.getSourceFile(path.join(projectRoot, runnerPath));
  if (!runnerSource) throw new Error(`TypeScript Program 缺少组 runner：${runnerPath}`);
  const dispatcher = runnerSource.statements.find((statement): statement is ts.FunctionDeclaration => (
    ts.isFunctionDeclaration(statement) && statement.name?.text === 'runProductCenterGroupCase'
  ));
  if (!dispatcher?.body) throw new Error('组 runner 缺少 runProductCenterGroupCase');

  return {
    compile(handlerId: string): DependencyGraph {
      // Every handler owns an independent dependency closure. Sharing this set
      // across compile calls makes a case fingerprint depend on which unrelated
      // handler happened to be compiled first.
      const visitedDeclarations = new Set<string>();
      const branch = findHandlerBranch(dispatcher.body!, handlerId);
      if (!branch) throw new Error(`组 runner 未找到 handler 分支：${handlerId}`);
      const fragments = new Map<string, string>();
      const dependencyFiles = new Set<string>();
      const dependencySymbols = new Set<string>();
      const branchId = `${runnerPath}#handler:${handlerId}`;
      fragments.set(branchId, branch.getText(runnerSource));
      dependencyFiles.add(runnerPath);
      dependencySymbols.add(branchId);

      const visitNode = (node: ts.Node): void => {
        if (ts.isTypeNode(node)) return;
        if (ts.isIdentifier(node)) visitSymbol(node);
        ts.forEachChild(node, visitNode);
      };
      const visitSymbol = (identifier: ts.Identifier): void => {
        let symbol = checker.getSymbolAtLocation(identifier);
        if (!symbol) return;
        if ((symbol.flags & ts.SymbolFlags.Alias) !== 0) symbol = checker.getAliasedSymbol(symbol);
        for (const declaration of symbol.declarations ?? []) visitDeclaration(declaration);
      };
      const visitDeclaration = (declaration: ts.Declaration): void => {
        const sourceFile = declaration.getSourceFile();
        const relativePath = normalizeRelative(projectRoot, sourceFile.fileName);
        if (!relativePath || relativePath.startsWith('node_modules/') || sourceFile.isDeclarationFile) return;
        if (sourceFile === runnerSource && declaration.pos >= branch.pos && declaration.end <= branch.end) return;
        if (ts.isInterfaceDeclaration(declaration)
          || ts.isTypeAliasDeclaration(declaration)
          || ts.isPropertySignature(declaration)
          || ts.isMethodSignature(declaration)
          || ts.isCallSignatureDeclaration(declaration)
          || ts.isConstructSignatureDeclaration(declaration)
          || ts.isIndexSignatureDeclaration(declaration)
          || ts.isTypeParameterDeclaration(declaration)) return;
        const key = `${relativePath}:${declaration.pos}:${declaration.end}`;
        if (visitedDeclarations.has(key)) return;
        visitedDeclarations.add(key);
        const symbolName = declarationName(declaration, sourceFile);
        // Names such as `id` legitimately occur in multiple declarations in
        // one file. Include the declaration span so Map insertion order cannot
        // overwrite one declaration with another unrelated declaration.
        const symbolId = `${relativePath}#${symbolName}@${declaration.pos}:${declaration.end}`;
        if (ts.isClassDeclaration(declaration)) {
          const runtimeMembers = declaration.members.filter((member) => (
            ts.isConstructorDeclaration(member)
            || (ts.isPropertyDeclaration(member) && member.initializer !== undefined)
          ));
          fragments.set(`${symbolId}:runtime-shell`, [
            declaration.name?.getText(sourceFile) ?? 'anonymous-class',
            ...declaration.heritageClauses?.map((item) => item.getText(sourceFile)) ?? [],
            ...runtimeMembers.map((item) => item.getText(sourceFile)),
          ].join('\n'));
          dependencyFiles.add(relativePath);
          dependencySymbols.add(`${symbolId}:runtime-shell`);
          for (const member of runtimeMembers) visitNode(member);
          return;
        }
        fragments.set(symbolId, declaration.getText(sourceFile));
        dependencyFiles.add(relativePath);
        dependencySymbols.add(symbolId);
        visitNode(declaration);
      };
      visitNode(branch);
      return {
        dependencyFiles: [...dependencyFiles].sort(),
        dependencySymbols: [...dependencySymbols].sort(),
        fragments: [...fragments.entries()]
          .map(([id, content]) => ({ id, content }))
          .sort((left, right) => left.id.localeCompare(right.id)),
      };
    },
  };
}

function findHandlerBranch(body: ts.Block, handlerId: string): ts.IfStatement | null {
  let match: ts.IfStatement | null = null;
  const visit = (node: ts.Node): void => {
    if (match) return;
    if (ts.isIfStatement(node) && expressionContainsHandler(node.expression, handlerId)) {
      match = node;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(body);
  return match;
}

function expressionContainsHandler(expression: ts.Expression, handlerId: string): boolean {
  let found = false;
  const visit = (node: ts.Node): void => {
    if ((ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) && node.text === handlerId) found = true;
    if (!found) ts.forEachChild(node, visit);
  };
  visit(expression);
  return found;
}

function declarationName(declaration: ts.Declaration, sourceFile: ts.SourceFile): string {
  const named = declaration as ts.Declaration & { name?: ts.DeclarationName };
  const ownName = named.name?.getText(sourceFile) ?? ts.SyntaxKind[declaration.kind];
  const parent = declaration.parent;
  if ((ts.isMethodDeclaration(declaration) || ts.isPropertyDeclaration(declaration) || ts.isConstructorDeclaration(declaration))
    && ts.isClassDeclaration(parent)) {
    return `${parent.name?.text ?? 'anonymous-class'}.${ownName}`;
  }
  return ownName;
}

function normalizeRelative(projectRoot: string, filePath: string): string | null {
  const relativePath = path.relative(projectRoot, filePath).replaceAll(path.sep, '/');
  if (!relativePath || relativePath.startsWith('../')) return null;
  return relativePath;
}

function readRequiredFile(projectRoot: string, relativePath: string): string {
  const filePath = path.join(projectRoot, relativePath);
  if (!fs.existsSync(filePath)) throw new Error(`用例指纹依赖文件不存在：${relativePath}`);
  return fs.readFileSync(filePath, 'utf8');
}

function hashStable(value: unknown): string {
  return sha256(JSON.stringify(value));
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
