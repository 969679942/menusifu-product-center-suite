const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const LOGIN_FILE = path.join(__dirname, '..', '登录信息.txt');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const TESTS_DIR = path.join(__dirname, '..', 'tests', 'generated');

function parseLoginFile() {
  const text = fs.readFileSync(LOGIN_FILE, 'utf8');
  const url = text.match(/URL[:：]\s*(\S+)/)?.[1];
  const username = text.match(/账号[:：]\s*(\S+)/)?.[1];
  const password = text.match(/密码[:：]\s*(\S+)/)?.[1];
  const merchant = text.match(/选择商户[:：]\s*(.+?)后/)?.[1]?.trim();
  return { url, username, password, merchant };
}

async function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

async function waitForAppReady(page) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(1500);
}

async function loginIfNeeded(page, { username, password }) {
  if (!page.url().includes('auth.menusifucloudqa.com')) return;

  await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('input[type="email"]').fill(username);
  await page.locator('input[type="password"]').fill(password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL(/cc-fe\.balamxqa\.com/, { timeout: 60000 });
  await waitForAppReady(page);
}

async function selectMerchantIfNeeded(page, merchant) {
  await page.waitForFunction(
    () => document.body.innerText.includes('选择商户') || document.querySelectorAll('button').length > 1,
    { timeout: 60000 }
  );

  if (!(await page.getByText('选择商户').isVisible().catch(() => false))) return;

  await page.getByText(merchant, { exact: false }).click();
  await page.waitForTimeout(500);
  await page.getByRole('button', { name: /确\s*定/ }).click();
  await page.waitForTimeout(5000);
}

async function extractPageFeatures(page) {
  return page.evaluate(() => {
    const visible = (el) => {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    };

    const textOf = (el) => (el.innerText || el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ');

    const sidebarItems = [...document.querySelectorAll('.ant-menu-item, .ant-menu-submenu-title, [class*="menu"] a, nav a')]
      .filter(visible)
      .map((el) => textOf(el))
      .filter((t) => t && t.length < 30);

    const buttons = [...document.querySelectorAll('button, [role="button"], .ant-btn')]
      .filter(visible)
      .map((el) => ({
        text: textOf(el),
        disabled: el.disabled || el.getAttribute('aria-disabled') === 'true',
      }))
      .filter((b) => b.text);

    const inputs = [...document.querySelectorAll('input, textarea, select')]
      .filter(visible)
      .map((el) => ({
        inputType: el.type || el.tagName.toLowerCase(),
        placeholder: el.placeholder || '',
        name: el.name || el.id || el.getAttribute('aria-label') || '',
      }));

    const headings = [...document.querySelectorAll('h1, h2, h3, h4, .ant-page-header-heading-title')]
      .filter(visible)
      .map((el) => textOf(el))
      .filter(Boolean);

    const listItems = [...document.querySelectorAll('.ant-list-item, [class*="card"], [class*="item"]')]
      .filter(visible)
      .map((el) => textOf(el))
      .filter((t) => t && t.length < 80 && !t.includes('MenuSifu'));

    const pagination = textOf(document.querySelector('.ant-pagination, [class*="pagination"]') || document.createElement('div'));

    const channelItems = [...document.querySelectorAll('[class*="channel"], .ant-list-item')]
      .filter(visible)
      .map((el) => textOf(el))
      .filter((t) => t && t.length < 20);

    return {
      title: document.title,
      url: location.href,
      pageName: document.title.split('-')[0]?.trim() || '',
      headings: [...new Set(headings)],
      sidebarItems: [...new Set(sidebarItems)],
      channelItems: [...new Set(channelItems)],
      buttons: [...new Map(buttons.map((b) => [b.text, b])).values()],
      inputs,
      listItems: [...new Set(listItems)].slice(0, 20),
      paginationText: pagination,
      bodySummary: document.body.innerText.slice(0, 2000),
    };
  });
}

function generateManualTestCases(features) {
  const cases = [];
  let id = 1;

  const add = (title, steps, expected) => {
    cases.push({ id: `TC-${String(id++).padStart(3, '0')}`, title, steps, expected });
  };

  add(
    '页面加载与标题验证',
    ['登录并选择商户', `访问 ${features.url}`, '等待页面加载完成'],
    `页面标题包含「${features.pageName || '图片管理'}」，URL 正确`
  );

  if (features.inputs.some((i) => i.placeholder.includes('图片名称'))) {
    add(
      '按图片名称搜索',
      ['进入图片管理页面', '在搜索框输入已有图片名称', '观察列表过滤结果'],
      '列表仅显示名称匹配的图片项'
    );
    add(
      '搜索无结果场景',
      ['进入图片管理页面', '在搜索框输入不存在的名称', '观察列表'],
      '列表为空或显示无数据提示'
    );
  }

  features.buttons.filter((b) => b.text.includes('添加') && !b.disabled).forEach((b) => {
    add(
      `点击「${b.text}」按钮`,
      ['进入图片管理页面', `点击「${b.text}」按钮`, '观察弹窗或跳转'],
      '打开新增图片表单/弹窗，必填字段可见'
    );
  });

  if (features.channelItems.length) {
    add(
      '渠道筛选功能',
      ['进入图片管理页面', '查看左侧渠道列表', '切换不同渠道选项'],
      '列表内容随所选渠道变化'
    );
  }

  if (features.listItems.length) {
    add(
      '图片列表展示',
      ['进入图片管理页面', '查看图片列表区域'],
      '已有图片项正常展示，包含缩略图和名称'
    );
    add(
      '图片项操作菜单',
      ['进入图片管理页面', '点击图片项的「...」菜单', '查看可用操作'],
      '显示编辑、删除等操作选项（以实际功能为准）'
    );
  }

  if (features.paginationText.includes('共')) {
    add(
      '分页信息显示',
      ['进入图片管理页面', '查看底部分页区域'],
      '正确显示总条数，页码可切换（多页时）'
    );
  }

  features.sidebarItems.filter((s) => s === '图片管理').forEach(() => {
    add(
      '侧边栏导航 - 图片管理',
      ['登录系统', '点击侧边栏「图片管理」'],
      '进入图片管理页面，渠道和列表区域可见'
    );
  });

  return cases;
}

function generatePlaywrightSpec(features, manualCases) {
  const pageName = features.pageName || '图片管理';
  const escaped = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

  const tests = manualCases.map((tc) => {
    if (tc.id === 'TC-001') {
      return `  test('${tc.title}', async ({ page }) => {
    await page.goto('${features.url}');
    await expect(page).toHaveTitle(/${escaped(pageName)}/);
  });`;
    }
    if (tc.title.includes('搜索') && tc.title.includes('按图片名称')) {
      return `  test('${tc.title}', async ({ page }) => {
    await page.goto('${features.url}');
    await page.getByPlaceholder('图片名称').fill('a');
    await expect(page.getByText('a', { exact: false })).toBeVisible();
  });`;
    }
    if (tc.title.includes('添加')) {
      return `  test('${tc.title}', async ({ page }) => {
    await page.goto('${features.url}');
    await page.getByRole('button', { name: '添加' }).click();
    // TODO: 补充弹窗/表单断言
  });`;
    }
    if (tc.title.includes('渠道')) {
      return `  test('${tc.title}', async ({ page }) => {
    await page.goto('${features.url}');
    await expect(page.getByText('渠道')).toBeVisible();
    await expect(page.getByText('全部')).toBeVisible();
  });`;
    }
    if (tc.title.includes('列表展示')) {
      return `  test('${tc.title}', async ({ page }) => {
    await page.goto('${features.url}');
    await expect(page.getByText(/共\\s*\\d+\\s*条/)).toBeVisible();
  });`;
    }
    return `  test('${tc.title}', async ({ page }) => {
    await page.goto('${features.url}');
    // TODO: ${tc.expected}
  });`;
  });

  return `// 自动生成 - ${pageName}
// URL: ${features.url}
// 生成时间: ${new Date().toISOString()}
// 注意: 运行前需配置 auth setup 或先执行 globalSetup 登录

const { test, expect } = require('@playwright/test');

test.describe('${pageName}', () => {
${tests.join('\n\n')}
});
`;
}

function generateMarkdownReport(features, manualCases) {
  const lines = [
    `# ${features.pageName || '页面'} - 功能探索报告`,
    '',
    `- **URL**: ${features.url}`,
    `- **标题**: ${features.title}`,
    `- **生成时间**: ${new Date().toISOString()}`,
    '',
    '## 识别到的功能',
    '',
  ];

  if (features.headings.length) {
    lines.push('### 页面区块', ...features.headings.map((h) => `- ${h}`), '');
  }
  if (features.channelItems.length) {
    lines.push('### 渠道选项', ...features.channelItems.map((c) => `- ${c}`), '');
  }
  if (features.buttons.length) {
    lines.push('### 操作按钮', ...features.buttons.map((b) => `- ${b.text}${b.disabled ? ' (禁用)' : ''}`), '');
  }
  if (features.inputs.length) {
    lines.push('### 输入字段', ...features.inputs.map((i) => `- ${i.placeholder || i.name || i.inputType}`), '');
  }
  if (features.listItems.length) {
    lines.push('### 列表项', ...features.listItems.map((item) => `- ${item}`), '');
  }
  if (features.paginationText) {
    lines.push('### 分页', `- ${features.paginationText}`, '');
  }

  lines.push('## 生成的测试用例', '');
  manualCases.forEach((tc) => {
    lines.push(`### ${tc.id} ${tc.title}`, '', '**步骤:**', ...tc.steps.map((s, i) => `${i + 1}. ${s}`), '', '**预期:**', `- ${tc.expected}`, '');
  });

  return lines.join('\n');
}

async function main() {
  const config = parseLoginFile();
  ensureDir(OUTPUT_DIR);
  ensureDir(TESTS_DIR);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  console.log(`正在访问: ${config.url}`);
  await page.goto(config.url, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(2000);

  console.log('登录...');
  await loginIfNeeded(page, config);

  console.log('选择商户...');
  await selectMerchantIfNeeded(page, config.merchant);

  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUTPUT_DIR, 'page-screenshot.png'), fullPage: true });

  console.log('提取页面功能...');
  const features = await extractPageFeatures(page);
  const manualCases = generateManualTestCases(features);
  const specContent = generatePlaywrightSpec(features, manualCases);
  const report = generateMarkdownReport(features, manualCases);

  const safeName = (features.pageName || 'page').replace(/[^\w\u4e00-\u9fa5]+/g, '_');

  fs.writeFileSync(path.join(OUTPUT_DIR, 'page-features.json'), JSON.stringify(features, null, 2), 'utf8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'exploration-report.md'), report, 'utf8');
  fs.writeFileSync(path.join(OUTPUT_DIR, 'manual-test-cases.json'), JSON.stringify(manualCases, null, 2), 'utf8');
  fs.writeFileSync(path.join(TESTS_DIR, `${safeName}.spec.js`), specContent, 'utf8');

  // 保存登录态供后续测试复用
  await context.storageState({ path: path.join(OUTPUT_DIR, 'auth-state.json') });

  console.log('\n=== 探索完成 ===');
  console.log(`页面: ${features.pageName}`);
  console.log(`按钮: ${features.buttons.length} 个`);
  console.log(`输入框: ${features.inputs.length} 个`);
  console.log(`列表项: ${features.listItems.length} 个`);
  console.log(`测试用例: ${manualCases.length} 条`);
  console.log(`\n报告: output/exploration-report.md`);
  console.log(`自动化测试: tests/generated/${safeName}.spec.js`);

  await browser.close();
}

main().catch((err) => {
  console.error('探索失败:', err);
  process.exit(1);
});
