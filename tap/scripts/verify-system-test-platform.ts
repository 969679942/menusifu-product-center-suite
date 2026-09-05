import path from 'node:path';
import { runProjectLifecycle } from './run-project-lifecycle';

/**
 * Public final gate.  A missing or incomplete project adapter is an explicit
 * platform-goal blocker, never an unclassified command failure.
 */
function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

const projectRoot = path.resolve(argument('project-root') ?? process.env.SYSTEM_TEST_PROJECT_ROOT ?? process.cwd());

try {
  const result = runProjectLifecycle({ projectRoot, action: 'strict' });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write('SYSTEM_TEST_PLATFORM_READY\n');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const blocker = message.startsWith('FINAL_GOAL_NOT_MET:')
    ? message.slice('FINAL_GOAL_NOT_MET:'.length)
    : message.includes('缺少项目适配描述')
      ? 'PROJECT_ADAPTER_REQUIRED'
      : message;
  process.stderr.write(`FINAL_GOAL_NOT_MET:${blocker}\n`);
  process.exitCode = 2;
}
