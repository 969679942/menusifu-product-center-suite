import { test } from '@playwright/test';
import { renderBusinessStepTitle } from '../../../Test Automation Platform/src/reporters/allure-step-policy';
import {
  finishExecutableOperation,
  startExecutableOperation,
} from './executable-operation-receipt';

type StepTitle = string | ((...args: any[]) => string);
type AnyMethod = (...args: any[]) => any;
type StepOptions = {
  executableOperation?: boolean;
};

export function step(title?: StepTitle, options: StepOptions = {}) {
  return function (originalMethod: AnyMethod, context: { name: string | symbol }) {
    return async function (this: unknown, ...args: any[]) {
      const stepTitle =
        typeof title === 'function'
          ? title(...args)
          : renderStepTitle(title ?? `步骤：${String(context.name)}`, args);

      if (!hasActiveTest()) return await originalMethod.apply(this, args);
      if (options.executableOperation === false) {
        return originalMethod.apply(this, args);
      }
      const testInfo = test.info();
      const operation = startExecutableOperation({
        executionId: testInfo.testId,
        operationKey: `${this?.constructor?.name ?? 'Unknown'}.${String(context.name)}`,
        title: stepTitle,
        method: String(context.name),
      });
      try {
        const result = await test.step(stepTitle, async () => originalMethod.apply(this, args));
        finishExecutableOperation(operation, 'passed');
        return result;
      } catch (error) {
        finishExecutableOperation(operation, 'failed');
        throw error;
      }
    };
  };
}

export function renderStepTitle(template: string, args: readonly unknown[]): string {
  return renderBusinessStepTitle(template, args);
}

function hasActiveTest(): boolean {
  try {
    test.info();
    return true;
  } catch {
    return false;
  }
}
