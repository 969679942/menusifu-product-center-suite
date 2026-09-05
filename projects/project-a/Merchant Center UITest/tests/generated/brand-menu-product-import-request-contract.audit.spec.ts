import fs from 'node:fs';
import path from 'node:path';
import type { Request } from '@playwright/test';
import { expect, test } from '../../fixtures/product-center.fixture';

type RequestContractEvidence = {
  capturedAt: string;
  phase: 'file-selection';
  pagePath: string;
  declaredRequestPath: string;
  requestPath: string;
  matchesDeclaredRequestPath: boolean;
  method: string;
  contentType: string;
  contentLength: string;
  formFieldNames: string[];
  fileFieldNames: string[];
  inputAccept: string;
  trigger: 'file-selection' | 'explicit-upload-button';
  blockedBeforeServer: true;
};

const targetPath = '/ops-brand/menu-import/upload';

test('审计商品导入页面的实际上传请求合同', async ({ page, itemListFlow }) => {
  let captureArmed = false;
  let resolveCapturedRequest: (request: Request) => void = () => undefined;
  const capturedRequest = new Promise<Request>((resolve) => {
    resolveCapturedRequest = resolve;
  });

  await page.route('**/*', async (route) => {
    const request = route.request();
    const requestPath = new URL(request.url()).pathname;
    if (
      !captureArmed
      || ['GET', 'HEAD', 'OPTIONS'].includes(request.method())
      || !requestPath.includes('/ops-brand/')
    ) {
      await route.continue();
      return;
    }
    resolveCapturedRequest(request);
    await route.abort('blockedbyclient');
  });

  const importPage = await itemListFlow.openProductImportFromList(page);
  await importPage.expectLoaded();

  const inputAccept = await importPage.readFileInputAccept();

  await test.step('第 1 步：选择内存中的审计文件并等待页面发起上传请求', async () => {
    captureArmed = true;
    await importPage.selectAuditFile({
      name: 'contract-audit.xlsx',
      mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      buffer: Buffer.from('contract-audit-only'),
    });
  });

  let trigger: RequestContractEvidence['trigger'] = 'file-selection';
  let request = await waitForCapturedRequest(capturedRequest, 3_000);
  if (!request) {
    trigger = 'explicit-upload-button';
    captureArmed = true;
    await test.step('第 2 步：点击明确的上传按钮并在到达服务器前中止请求', async () => {
      await importPage.submit();
    });
    request = await waitForCapturedRequest(capturedRequest, 10_000);
  }

  expect(request, '页面选择文件或点击上传后应发起商品导入请求').toBeTruthy();
  const headers = request!.headers();
  const requestUrl = new URL(request!.url());
  const postData = request!.postDataBuffer()?.toString('utf8') ?? '';
  const dispositionLines = postData.split(/\r?\n/).filter((line) => /^Content-Disposition:/i.test(line));
  const formFieldNames = dispositionLines
    .map((line) => line.match(/;\s*name="([^"]+)"/i)?.[1])
    .filter((name): name is string => Boolean(name));
  const fileFieldNames = dispositionLines
    .filter((line) => /;\s*filename="/i.test(line))
    .map((line) => line.match(/;\s*name="([^"]+)"/i)?.[1])
    .filter((name): name is string => Boolean(name));
  const evidence: RequestContractEvidence = {
    capturedAt: new Date().toISOString(),
    phase: 'file-selection',
    pagePath: new URL(page.url()).pathname,
    declaredRequestPath: targetPath,
    requestPath: requestUrl.pathname,
    matchesDeclaredRequestPath: requestUrl.pathname === targetPath,
    method: request!.method(),
    contentType: headers['content-type'] ?? '',
    contentLength: headers['content-length'] ?? '',
    formFieldNames: [...new Set(formFieldNames)].sort(),
    fileFieldNames: [...new Set(fileFieldNames)].sort(),
    inputAccept,
    trigger,
    blockedBeforeServer: true,
  };

  await test.step('断言：页面实际请求路径、方法和媒体类型均已取证', async () => {
    expect(evidence.requestPath).toContain('/ops-brand/');
    expect(['POST', 'PUT', 'PATCH', 'DELETE']).toContain(evidence.method);
    expect(evidence.contentType).not.toBe('');
  });

  const outputPath = path.resolve(process.cwd(), 'output/brand-menu-product-import-request-contract-audit.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(evidence, null, 2), 'utf8');
});

async function waitForCapturedRequest(
  requestPromise: Promise<Request>,
  timeoutMs: number,
): Promise<Request | undefined> {
  return Promise.race([
    requestPromise,
    new Promise<undefined>((resolve) => setTimeout(() => resolve(undefined), timeoutMs)),
  ]);
}
