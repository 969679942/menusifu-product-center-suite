import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { createHash } from 'node:crypto';

const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'output/quality/product-center-maintainability-api-snapshot.json');
const hotspotPaths = [
  'utils/product-center-group-runner.ts',
  'flows/product-center/item-216/standard-item-216.flow.ts',
  'flows/product-center/item-216/package-item-216.flow.ts',
  'pages/product-management/group-list.page.ts',
  'pages/product-center/seasoning-boundary.page.ts',
];

const files = hotspotPaths.map((relativePath) => {
  const filePath = path.join(projectRoot, relativePath);
  const sourceText = fs.readFileSync(filePath, 'utf8');
  const source = ts.createSourceFile(filePath, sourceText, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const classes = source.statements.filter(ts.isClassDeclaration).map((declaration) => ({
    name: declaration.name?.text ?? '<anonymous>',
    methods: declaration.members.filter(ts.isMethodDeclaration)
      .filter((method) => !method.modifiers?.some((modifier) =>
        [ts.SyntaxKind.PrivateKeyword, ts.SyntaxKind.ProtectedKeyword].includes(modifier.kind)))
      .map((method) => ({
        name: method.name.getText(source),
        parameterCount: method.parameters.length,
        async: method.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false,
        line: source.getLineAndCharacterOfPosition(method.getStart(source)).line + 1,
      })),
  }));
  const exportedFunctions = source.statements.filter(ts.isFunctionDeclaration)
    .filter((declaration) => declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword))
    .map((declaration) => ({
      name: declaration.name?.text ?? '<anonymous>',
      parameterCount: declaration.parameters.length,
      async: declaration.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword) ?? false,
      line: source.getLineAndCharacterOfPosition(declaration.getStart(source)).line + 1,
    }));
  return {
    path: relativePath,
    sourceSha256: createHash('sha256').update(sourceText).digest('hex'),
    lines: sourceText.split(/\r?\n/).length,
    classes,
    exportedFunctions,
  };
});

const report = {
  schemaVersion: '1.0.0',
  generatedAt: new Date().toISOString(),
  purpose: '拆分前公开方法与源码指纹快照；不授权业务执行',
  summary: {
    classMethodCount: files.reduce((sum, file) => sum + file.classes.reduce((n, c) => n + c.methods.length, 0), 0),
    exportedFunctionCount: files.reduce((sum, file) => sum + file.exportedFunctions.length, 0),
    publicSurfaceCount: files.reduce((sum, file) => sum
      + file.classes.reduce((n, c) => n + c.methods.length, 0)
      + file.exportedFunctions.length, 0),
  },
  files,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(JSON.stringify({ outputPath, files: files.length, publicSurfaceCount: report.summary.publicSurfaceCount }) + '\n');
