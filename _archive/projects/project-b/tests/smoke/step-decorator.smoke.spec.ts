import { expect, test } from '../../fixtures/test.fixture';
import { step } from '../../utils/step';

class StepDecoratorProbe {
  @step((value: string) => `测试步骤：返回 ${value}`)
  async echo(value: string): Promise<string> {
    return value;
  }
}

test.describe('步骤装饰器冒烟', () => {
  test(
    '步骤装饰器不应改变原始返回值',
    {
      tag: ['@smoke'],
    },
    async () => {
      const probe = new StepDecoratorProbe();
      await expect(probe.echo('merchant-center')).resolves.toBe('merchant-center');
    },
  );
});
