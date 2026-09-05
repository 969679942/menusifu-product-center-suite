import fs from 'node:fs';
import path from 'node:path';
import { recordChangeEvent, type ChangeObjectType } from '../../../Test Automation Platform/src/audit/change-event';

const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const read = (name: string): string | undefined => args.find((item) => item.startsWith(`--${name}=`))?.slice(name.length + 3);
const objectType = read('object-type') as ChangeObjectType | undefined;
const objectId = read('object-id');
const beforePath = read('before-file');
const afterPath = read('after-file');
if (!objectType || !objectId || !afterPath) {
  throw new Error('用法：--object-type=test-case|business-rule|api-script|ui-script|binding|test-plan --object-id=... --after-file=... [--before-file=...]');
}
const resolve = (value: string): string => path.isAbsolute(value) ? path.resolve(value) : path.resolve(projectRoot, value);
const afterFile = resolve(afterPath);
const before = beforePath ? readText(resolve(beforePath)) : undefined;
const after = readText(afterFile);
const result = recordChangeEvent({
  eventLogPath: resolve(read('event-log') ?? 'output/audit/product-center-events.jsonl'),
  applicationId: 'merchant-center', businessDomainId: 'product-center',
  planId: 'merchant-center-product-center', objectType, objectId,
  before, after,
  caseId: read('case-id'), affectedCaseIds: (read('affected-case-ids') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  changedBy: read('changed-by'), changeSource: read('change-source') ?? 'manual-save', changeReason: read('change-reason'),
  sourceRefs: [afterPath], bindingIds: (read('binding-ids') ?? '').split(',').map((value) => value.trim()).filter(Boolean),
  runId: read('run-id'), occurredAt: read('occurred-at'),
});
process.stdout.write(`变更事件已记录：${result.event.eventId}\n前指纹：${result.event.beforeFingerprint ?? '未提供'}\n后指纹：${result.event.afterFingerprint ?? '未提供'}\n`);

function readText(filePath: string): string {
  if (!fs.existsSync(filePath)) throw new Error(`变更文件不存在：${filePath}`);
  return fs.readFileSync(filePath, 'utf8');
}
