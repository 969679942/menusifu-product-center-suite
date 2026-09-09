import { expect, test } from '../../fixtures/product-center.fixture';
import {
  createFlavorsPage,
  createPreparationsPage,
  createSpecificationsPage,
} from '../../pages/product-management/group-list.factory';

test.describe('商品中心组编辑明细只读审计', () => {
  const definitions = [
    ['规格组', createSpecificationsPage],
    ['口味组', createFlavorsPage],
    ['做法组', createPreparationsPage],
  ] as const;

  for (const [name, createPage] of definitions) {
    test(`${name}编辑明细页面结构`, async ({ page }, testInfo) => {
      const pageObject = createPage(page);
      const mutations: string[] = [];
      const detailResponses: unknown[] = [];
      const observedSpecReads: string[] = [];
      page.on('request', (request) => {
        const pathname = new URL(request.url()).pathname;
        if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
          && /\/(brand-specs|brand-modifiers)(\/|$)/.test(pathname)) {
          mutations.push(`${request.method()} ${pathname}`);
        }
      });
      page.on('response', async (response) => {
        const pathname = new URL(response.url()).pathname;
        if (name === '规格组'
          && response.request().method() === 'GET'
          && /\/brand-specs(?:\/|$)/.test(pathname)) {
          observedSpecReads.push(pathname);
          if (response.ok()) {
            detailResponses.push(await response.json().catch(() => null));
          }
        }
      });
      await pageObject.open();
      const surface = await pageObject.openFirstRowEditSurface();
      const snapshot = await surface.evaluate((element) => ({
        url: window.location.href,
        inputs: Array.from(element.querySelectorAll('input'))
          .filter((input) => Boolean((input as HTMLElement).offsetParent))
          .map((input) => ({
            placeholder: input.getAttribute('placeholder'),
            type: input.getAttribute('type'),
            maxLength: input.getAttribute('maxlength'),
            ariaRequired: input.getAttribute('aria-required'),
            formItemText: (input.closest('.ant-form-item')?.textContent ?? '').trim(),
            parentText: (input.parentElement?.parentElement?.textContent ?? '').trim(),
          })),
        buttons: Array.from(element.querySelectorAll('button'))
          .filter((button) => Boolean((button as HTMLElement).offsetParent))
          .map((button) => button.getAttribute('aria-label') ?? button.getAttribute('title') ?? (button.textContent ?? '').trim())
          .filter(Boolean),
        labels: Array.from(element.querySelectorAll('label'))
          .filter((label) => Boolean((label as HTMLElement).offsetParent))
          .map((label) => (label.textContent ?? '').trim())
          .filter(Boolean),
      }));
      expect(snapshot.inputs.length, `${name}编辑页必须有可见输入字段`).toBeGreaterThan(0);
      expect(mutations, `${name}只读编辑审计不得发送写请求`).toEqual([]);
      if (name === '规格组') expect(observedSpecReads.length, '规格编辑页必须观察到规格读取响应').toBeGreaterThan(0);
      await testInfo.attach(`${name}-detail-form-contract`, {
        body: Buffer.from(JSON.stringify({ snapshot, mutations, observedSpecReads, detailResponses }, null, 2)),
        contentType: 'application/json',
      });
      const addDetailSurface = await pageObject.openAddDetailSurface();
      const addDetailSnapshot = await addDetailSurface.evaluate((element) => ({
        dialog: element.getAttribute('role') === 'dialog',
        tables: Array.from(element.querySelectorAll('table')).map((table, tableIndex) => ({
          tableIndex,
          headers: Array.from(table.querySelectorAll('thead th')).map((header, columnIndex) => ({
            columnIndex,
            text: (header.textContent ?? '').trim(),
            dataIndex: header.getAttribute('data-index'),
            className: header.getAttribute('class'),
          })),
          rows: Array.from(table.querySelectorAll('tbody tr')).map((row, rowIndex) => ({
            rowIndex,
            cells: Array.from(row.querySelectorAll(':scope > td')).map((cell, columnIndex) => ({
              columnIndex,
              text: (cell.textContent ?? '').trim(),
              className: cell.getAttribute('class'),
              inputs: Array.from(cell.querySelectorAll('input')).map((input) => ({
                id: input.id || null,
                name: input.getAttribute('name'),
                placeholder: input.getAttribute('placeholder'),
                type: input.getAttribute('type'),
                maxLength: input.getAttribute('maxlength'),
                className: input.getAttribute('class'),
                dataAttributes: Object.fromEntries(
                  Array.from(input.attributes)
                    .filter((attribute) => attribute.name.startsWith('data-'))
                    .map((attribute) => [attribute.name, attribute.value]),
                ),
              })),
            })),
          })),
        })),
        inputs: Array.from(element.querySelectorAll('input'))
          .filter((input) => Boolean((input as HTMLElement).offsetParent))
          .map((input) => ({
            id: input.id || null,
            name: input.getAttribute('name'),
            placeholder: input.getAttribute('placeholder'),
            type: input.getAttribute('type'),
            maxLength: input.getAttribute('maxlength'),
            ariaRequired: input.getAttribute('aria-required'),
            cellIndex: input.closest('td')?.cellIndex ?? null,
            rowIndex: input.closest('tr')?.rowIndex ?? null,
            formItemText: (input.closest('.ant-form-item')?.textContent ?? '').trim(),
            parentText: (input.parentElement?.parentElement?.textContent ?? '').trim(),
          })),
        buttons: Array.from(element.querySelectorAll('button'))
          .filter((button) => Boolean((button as HTMLElement).offsetParent))
          .map((button) => button.getAttribute('aria-label') ?? button.getAttribute('title') ?? (button.textContent ?? '').trim())
          .filter(Boolean),
      }));
      expect(mutations, `${name}打开新增明细不得发送写请求`).toEqual([]);
      await testInfo.attach(`${name}-add-detail-contract`, {
        body: Buffer.from(JSON.stringify({ addDetailSnapshot, mutations }, null, 2)),
        contentType: 'application/json',
      });
      await pageObject.cancelCurrentSurface();
      expect(mutations, `${name}取消编辑审计不得发送写请求`).toEqual([]);
    });
  }
});
