import {expect, type Locator, type Page} from '@playwright/test';
import {step} from '../../../utils/step';
import {waitUntil,WaitUntilError} from '../../../utils/wait';

export type ItemTypeFilter = 'Standard' | 'Combo' | 'Add-On';

/** DOM evidence: readonly-query-contract-observation.json. */
export class StandardQueryReturnPage {
  private readonly itemEntry: Locator;
  private readonly categoryEntry: Locator;
  private readonly typeTrigger: Locator;
  private readonly typeSurface: Locator;
  private readonly typeRows: Locator;
  private readonly pagination: Locator;
  constructor(private readonly page: Page) {
    this.itemEntry=page.locator('a[href="/pp/brand/list"]');
    this.categoryEntry=page.locator('a[href="/pp/brand/category"]');
    this.typeTrigger=page.locator('[class*="selectLabel"]').filter({hasText:/^Type$/});
    this.typeSurface=page.locator('[class*="customSelect"]').filter({has:this.typeTrigger});
    this.typeRows=this.typeSurface.locator('[class*="optionItem"]');
    this.pagination=page.locator('.ant-pagination');
  }
  private typeOption(name: ItemTypeFilter) {return this.typeRows.filter({has:this.page.getByText(name,{exact:true})}).getByRole('checkbox');}
  private async readTypeValues():Promise<ItemTypeFilter[]> {return this.typeRows.evaluateAll(rows=>{if(rows.length!==3||rows.some(row=>!row.querySelector('input')))throw Error('TYPE_OPTION_SURFACE_INCOMPLETE');return rows.filter(row=>(row.querySelector('input') as HTMLInputElement).checked).map(row=>(row.textContent??'').trim() as ItemTypeFilter);});}
  @step('进入商品列表并等待筛选控件就绪')
  async open() {await this.page.goto('/pp/brand/list');await expect(this.typeTrigger).toHaveCount(1);await this.pagination.waitFor();}
  @step('打开类型筛选选项')
  async openTypes() {if(!await this.typeRows.count())await this.typeTrigger.click();await expect(this.typeRows).toHaveCount(3);}
  @step('读取当前类型筛选勾选值')
  async readTypes():Promise<ItemTypeFilter[]> {await this.openTypes();return this.readTypeValues();}
  @step('有界观察返回后的类型勾选状态并保留时间序列')
  async readSettledTypes(expected:ItemTypeFilter[]) {
    await this.openTypes();const startedAt=Date.now();const samples:Array<{elapsedMs:number;types:ItemTypeFilter[]}>=[];let outcome:'satisfied'|'condition-timeout'='satisfied';
    const matches=(types:ItemTypeFilter[])=>JSON.stringify(types)===JSON.stringify(expected);
    try {await waitUntil(async()=>{const types=await this.readTypeValues();samples.push({elapsedMs:Date.now()-startedAt,types});return types;},types=>matches(types)&&samples.length>=2&&matches(samples[samples.length-2].types)&&samples[samples.length-1].elapsedMs-samples[samples.length-2].elapsedMs>=200,{timeout:5000,interval:250,probeTimeout:1000,waitId:'STD030-type-clear-observation',observation:{channel:'ui',operation:'read-returned-type-filter',caseId:'TC-ITEM-STD-030'}});}
    catch(error){if(!(error instanceof WaitUntilError)||error.kind!=='condition-timeout')throw error;outcome='condition-timeout';}
    const actualValue=samples[samples.length-1]?.types;if(!actualValue)throw Error('TYPE_OBSERVATION_MISSING');
    const unchangedAcrossWindow=samples.length>=3&&samples[samples.length-1].elapsedMs>=4500&&samples.every(sample=>JSON.stringify(sample.types)===JSON.stringify(actualValue));
    return {actualValue,samples,outcome,configuredWindowMs:5000,unchangedAcrossWindow};
  }
  @step('设置类型筛选并核对勾选值')
  async selectTypes(names: ItemTypeFilter[]) {await this.openTypes();for(const name of ['Standard','Combo','Add-On'] as const){const option=this.typeOption(name);await expect(option).toHaveCount(1);await option.setChecked(names.includes(name));}expect(await this.readTypes()).toEqual(names);}
  @step('通过侧边栏离开商品列表并返回')
  async navigateAwayAndReturn() {await expect(this.categoryEntry).toHaveCount(1);await this.categoryEntry.click();await this.page.waitForURL('**/pp/brand/category');await expect(this.itemEntry).toHaveCount(1);await this.itemEntry.click();await this.page.waitForURL('**/pp/brand/list');await this.pagination.waitFor();}
}
