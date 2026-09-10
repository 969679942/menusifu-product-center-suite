import { expect, type Locator, type Page } from '@playwright/test';
import { step } from '../../../utils/step';
import { waitUntil } from '../../../utils/wait';

export type ColumnState = { name: string; checked: boolean; disabled: boolean }[];

/** Locators observed in readonly-list-contract-observation.json; no selector guessing. */
export class StandardListAcceptancePage {
  private readonly entry: Locator;
  private readonly pagination: Locator;
  private readonly headers: Locator;
  private readonly rows: Locator;
  private readonly columnTrigger: Locator;
  private readonly columnPanel: Locator;
  private readonly columnLabels: Locator;
  private readonly restoreDefaults: Locator;
  private readonly sizeSelector: Locator;
  private readonly sizeOptions: Locator;
  private readonly main: Locator;
  private readonly search: Locator;
  private readonly add: Locator;
  private readonly typeFilter: Locator;
  private readonly statusFilter: Locator;
  constructor(private readonly page: Page) {
    this.entry = page.locator('a[href="/pp/brand/list"]');
    this.pagination = page.locator('.ant-pagination');
    this.headers = page.locator('.ant-table-thead th');
    this.rows = page.locator('.ant-table-tbody > tr.ant-table-row');
    this.columnTrigger = page.getByRole('button').filter({ has: page.locator('svg[data-icon="profile"]') });
    this.columnPanel = page.locator('.ant-popover').filter({has:page.getByRole('checkbox',{name:'All',exact:true})});
    this.columnLabels = this.columnPanel.locator('label');
    this.restoreDefaults = this.columnPanel.getByText('Restore Defaults',{exact:true});
    this.sizeSelector = this.pagination.locator('.ant-select-selector');
    this.sizeOptions = page.locator('.ant-select-dropdown:visible .ant-select-item-option');
    this.main = page.locator('main');
    this.search = page.getByPlaceholder('Item Name',{exact:true});
    this.add = page.getByRole('button',{name:'plus Add Item',exact:true});
    this.typeFilter = page.getByText('Type',{exact:true});
    this.statusFilter = page.getByText('Status',{exact:true});
  }
  private column(name: string) { return this.columnLabels.filter({hasText:new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}$`)}).getByRole('checkbox'); }
  @step('进入商品列表并等待分页和表格就绪')
  async open() { await this.page.goto('/pp/brand/list'); await this.pagination.waitFor(); await waitUntil(()=>this.headers.count(), count=>count>1); }
  @step('通过侧边栏进入商品列表')
  async enterFromSidebar() { await expect(this.entry).toHaveCount(1); await this.entry.click(); await this.pagination.waitFor(); }
  @step('读取商品表格列与固定位置')
  async readHeaders() { return this.headers.evaluateAll(elements=>elements.map(element=>({name:(element.textContent??'').trim(),fixedLeft:element.classList.contains('ant-table-cell-fix-left'),fixedRight:element.classList.contains('ant-table-cell-fix-right')}))); }
  @step('读取商品筛选、新增入口与分类树')
  async readStructure() { return {search:await this.search.isVisible(),add:await this.add.isVisible(),type:await this.typeFilter.filter({visible:true}).count(),status:await this.statusFilter.filter({visible:true}).count(),categoryTrees:await this.main.getByRole('tree').count(),mainCount:await this.main.count(),images:await this.rows.locator('.ant-image').count()}; }
  @step('读取分页和统计信息')
  async readPagination() { const text=await this.pagination.innerText(); return {text,total:Number(text.match(/Total ([\d,]+) items/)?.[1].replaceAll(',','')??NaN),size:Number((await this.sizeSelector.innerText()).match(/\d+/)?.[0]),rows:await this.rows.count()}; }
  @step('读取商品页面总金额统计')
  async readAmountSummary() { return this.main.getByText(/total\s+(amount|price)|总金额/i).allTextContents(); }
  @step('打开展示列设置')
  async openColumns() { if(!await this.columnPanel.isVisible()){await expect(this.columnTrigger).toHaveCount(1);await this.columnTrigger.click();} await this.columnPanel.waitFor(); }
  @step('关闭展示列设置')
  async closeColumns() { if(await this.columnPanel.isVisible()){await this.search.click();await this.columnPanel.waitFor({state:'hidden'});} }
  @step('读取展示列设置的勾选状态')
  async readColumns():Promise<ColumnState> { return this.columnLabels.evaluateAll(elements=>elements.map(element=>{const input=element.querySelector('input') as HTMLInputElement;return {name:(element.textContent??'').trim(),checked:input.checked,disabled:input.disabled};})); }
  @step('设置展示列：{name}')
  async selectColumn(name:string,checked:boolean) { const checkbox=this.column(name);await expect(checkbox).toHaveCount(1);await checkbox.setChecked(checked);await expect(checkbox).toBeChecked({checked}); }
  @step('还原系统默认展示列')
  async clickRestoreDefaults() { await expect(this.restoreDefaults).toHaveCount(1);await this.restoreDefaults.click(); }
  @step('读取完整分页选项')
  async readSizeOptions() { await this.sizeSelector.click();await this.sizeOptions.filter({hasText:'100 / page'}).waitFor();const options=await this.sizeOptions.allTextContents();await this.page.keyboard.press('Escape');return options.map(text=>Number(text.match(/\d+/)?.[0])); }
  @step('切换每页条数并读取稳定列表：{size}')
  async selectSize(size:number) { await this.sizeSelector.click();const option=this.sizeOptions.filter({hasText:new RegExp(`^${size} / page$`)});await expect(option).toHaveCount(1);await option.click();return waitUntil(()=>this.readPagination(),value=>value.size===size&&value.rows===Math.min(value.total,size),{timeout:15000,message:'分页设置与实际商品行数未同步'}); }
}
