import path from 'node:path';
import {
  auditMigrationClosureFile,
  writeMigrationInventoryBaseline,
  writeMigrationClosureReport,
} from '../src/governance/migration-closure';

const manifestArgument = process.argv.find((argument) => argument.startsWith('--manifest='));
if (!manifestArgument) throw new Error('缺少 --manifest=<path>');
const manifestPath = path.resolve(process.cwd(), manifestArgument.slice('--manifest='.length));
if (process.argv.includes('--write-baseline')) {
  const approvedBy = argument('approved-by');
  const reason = argument('reason');
  if (!approvedBy || !reason) {
    throw new Error('接受迁移基线必须提供 --approved-by=<operator> 和 --reason=<reason>');
  }
  const result = writeMigrationInventoryBaseline(manifestPath, { approvedBy, reason });
  process.stdout.write(`迁移完整性基线：${result.baselinePath}\n`);
  process.stdout.write(`迁移基线接受收据：${result.acceptanceReceiptPath}\n`);
  process.exit(0);
}
const report = auditMigrationClosureFile(manifestPath);
const outputs = writeMigrationClosureReport(manifestPath, report);

process.stdout.write(`迁移闭环状态：${report.status}\n`);
process.stdout.write(`JSON：${outputs.jsonPath}\n`);
process.stdout.write(`Markdown：${outputs.markdownPath}\n`);
if (report.status !== 'complete') process.exitCode = 1;

function argument(name: string): string | undefined {
  return process.argv.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
}
