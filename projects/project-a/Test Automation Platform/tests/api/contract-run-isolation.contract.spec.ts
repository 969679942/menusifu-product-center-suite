import { expect, test } from '@playwright/test';
import { resolveContractRunIsolation } from '../../src/utils/contract-run-isolation';

const resolve = (argv: string[], isolationRequested = false) => resolveContractRunIsolation({
  argv, isolationRequested, contractProjectNames: ['contracts', 'schema'],
});

test('显式合同项目选择应隔离业务生命周期', () => {
  for (const argv of [['--project=contracts'], ['-p', 'contracts'], ['--project', 'contracts', 'schema'], ['--project=contracts,schema']]) {
    expect(resolve(argv).isolated).toBe(true);
  }
});

test('默认或混合执行必须保留业务清理且拒绝强制隔离', () => {
  for (const argv of [[], ['--project=browser'], ['--project', 'contracts', 'browser'], ['--project=contracts', 'browser'], ['--project=*'], ['--project=unknown'], ['--', '--project=contracts']]) {
    expect(resolve(argv).isolated).toBe(false);
    expect(() => resolve(argv, true)).toThrow('CONTRACT_ISOLATION_SELECTION_MISMATCH');
  }
});

test('缺失项目参数不得静默降级', () => {
  for (const argv of [['--project'], ['--project='], ['--project', '--workers=1'], ['-p=contracts,']]) {
    expect(() => resolve(argv)).toThrow('CONTRACT_ISOLATION_PROJECT_ARGUMENT_INVALID');
  }
});
