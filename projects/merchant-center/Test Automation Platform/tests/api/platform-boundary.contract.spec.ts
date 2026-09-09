import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { inspectPlatformBoundary, readPlatformForbiddenPatterns } from '../../src/platform-boundary';

test.describe('公共平台边界规则', () => {
  test('从 ownership.json 加载禁止词并识别源码泄漏', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'platform-boundary-'));
    try {
      fs.mkdirSync(path.join(root, 'src'), { recursive: true });
      fs.writeFileSync(path.join(root, 'ownership.json'), JSON.stringify({ publicCore: { forbiddenDomainTerms: ['secret-domain'] } }));
      fs.writeFileSync(path.join(root, 'src', 'leak.ts'), 'export const value = "secret-domain";');
      expect(readPlatformForbiddenPatterns(root)).toEqual({ patterns: ['secret-domain'], configured: true });
      expect(inspectPlatformBoundary({ rootDir: root })).toEqual([{ path: 'src/leak.ts', pattern: 'secret-domain' }]);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
