import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  assertDeliveryCompletion,
  evaluateDeliveryCompletion,
} from '../../../../Test Automation Platform/src/utils/test-plan-landing-gate';

const projectRoot = path.resolve(__dirname, '../..');
const closurePath = path.join(projectRoot, 'deliverables/system-test-platform/seasoning-module-closure.json');

test.describe('调味模块闭环口径门禁', () => {
  test('分类处置链覆盖不等于模块完成', async () => {
    const closure = JSON.parse(fs.readFileSync(closurePath, 'utf8')) as {
      moduleDeliveryStatus: string;
      denominator: { total: number };
      landing: { landed: number; unlanded: number; classifiedExclusions: number };
      runtime: {
        total: number;
        passed: number;
        productDefect: number;
        failed: number;
        ready: number;
        deferred: number;
        blockedSource: number;
        blockedTechnical: number;
        notApplicable: number;
      };
      completionGate: { unresolved: number; deliveryComplete: boolean };
    };

    expect(closure.denominator.total).toBe(102);
    expect(closure.runtime.total).toBe(closure.denominator.total);
    expect(closure.landing.landed).toBe(closure.denominator.total);
    expect(closure.landing.classifiedExclusions).toBe(
      closure.runtime.deferred
      + closure.runtime.blockedSource
      + closure.runtime.blockedTechnical
      + closure.runtime.notApplicable,
    );
    expect(closure.landing.unlanded).toBe(closure.runtime.ready + closure.runtime.blockedSource);
    expect(closure.completionGate.unresolved).toBe(
      closure.runtime.ready
      + closure.runtime.deferred
      + closure.runtime.notApplicable
      + closure.runtime.failed
      + closure.runtime.productDefect
      + closure.runtime.blockedSource
      + closure.runtime.blockedTechnical,
    );
    expect(closure.completionGate).toMatchObject({ deliveryComplete: false });
    expect(closure.moduleDeliveryStatus).toBe('incomplete');
  });

  test('调味闭环伪造 completed 时公共门禁必须拒绝', async () => {
    const completion = evaluateDeliveryCompletion({
      total: 102,
      acceptedComplete: 24,
      unresolved: 78,
      classifiedExclusions: 65,
    });
    expect(completion.deliveryComplete).toBe(false);
    expect(() => assertDeliveryCompletion(completion, 'completed')).toThrow(/DELIVERY_COMPLETION_CONTRACT_VIOLATION/);
  });
});
