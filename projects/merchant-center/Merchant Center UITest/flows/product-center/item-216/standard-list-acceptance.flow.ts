import { expect, test } from '@playwright/test';
import { StandardListAcceptancePage, type ColumnState } from '../../../pages/product-management/item/standard-list-acceptance.page';
import { step } from '../../../utils/step';
import { startExecutableOperation, finishExecutableOperation } from '../../../utils/executable-operation-receipt';

export class StandardListAcceptanceFlow {
  readonly assertions: Array<Record<string,unknown>>=[];
  readonly observations: Record<string,unknown>={};
  stateRestored=false;
  constructor(private readonly list:StandardListAcceptancePage) {}
  private async action<T>(caseId:string,index:number,title:string,run:()=>Promise<T>):Promise<T> {
    return test.step(`业务操作：${title}`,async()=>{const operation=startExecutableOperation({executionId:test.info().testId,operationKey:`${caseId}:action-${index}`,title,method:'ui'});
      try {const result=await run();finishExecutableOperation(operation,'passed');return result;}catch(error){finishExecutableOperation(operation,'failed');throw error;}});
  }
  private async verify(caseId:string,index:number,actualValue:unknown,expectedValue:unknown) {
    await test.step(`断言：正式预期第${index}项`,async()=>{const equal=JSON.stringify(actualValue)===JSON.stringify(expectedValue);
      const receipt={claimId:`${caseId}:expectation-${index}`,status:equal?'verified':'observed-mismatch',actualValue,expectedValue,actualStatus:'observed',observationChannel:'ui',authority:'user-visible',comparison:equal?'matched':'mismatched'};
      this.assertions.push(receipt);await test.info().attach('断言期望与实际',{body:JSON.stringify(receipt),contentType:'application/json'});
      expect.soft(actualValue,`正式预期${index}`).toEqual(expectedValue);
    });
  }
  private async restoreColumns(original:ColumnState) { await this.list.openColumns();for(const column of original.filter(value=>value.name!=='All'&&!value.disabled))await this.list.selectColumn(column.name,column.checked);expect(await this.list.readColumns()).toEqual(original);await this.list.closeColumns();this.stateRestored=true; }
  @step('按正式来源执行商品列表场景')
  async execute(caseId:string) {
    await this.list.open();const pagination=await this.list.readPagination();this.observations.initialPagination=pagination;
    if(caseId==='TC-ITEM-STD-004')throw Error('SOURCE_CONTRACT_MISSING:中英文正确文案与控件范围未定义');
    if(caseId==='TC-ITEM-STD-002')return this.verifyStructure(caseId);
    if(caseId==='TC-ITEM-STD-063')return this.verifyPagination(caseId);
    if(caseId==='TC-ITEM-STD-074')return this.verifyStatistics(caseId);
    await this.list.openColumns();const original=await this.list.readColumns();this.observations.originalColumns=original;
    try {
      if(caseId==='TC-ITEM-STD-003')return await this.verifySelection(caseId);
      if(caseId==='TC-ITEM-STD-072'||caseId==='TC-ITEM-STD-073')return await this.verifyDefaults(caseId);
      throw Error('UNREGISTERED_LIST_CASE');
    } finally {await test.step('清理：恢复测试前列配置并核验',()=>this.restoreColumns(original));}
  }
  @step('验证列表结构、核心字段和默认分页')
  async verifyStructure(id:string) {
    await this.action(id,1,'通过侧边栏进入商品列表',()=>this.list.enterFromSidebar());
    const structure=await this.action(id,2,'查看当前筛选区域',()=>this.list.readStructure());
    await this.verify(id,1,{mainPresent:structure.mainCount===1,categoryTrees:structure.categoryTrees},{mainPresent:true,categoryTrees:0});
    await this.verify(id,2,{search:structure.search,type:structure.type>0,status:structure.status>0,add:structure.add},{search:true,type:true,status:true,add:true});
    const headers=await this.action(id,3,'查看商品表格字段和操作入口',()=>this.list.readHeaders());
    await this.verify(id,3,{columns:['Item','Type','Specification','Price($)','Status','Action'].filter(name=>headers.some(header=>header.name===name)),imagePresent:structure.images>0},{columns:['Item','Type','Specification','Price($)','Status','Action'],imagePresent:true});
    const pagination=await this.action(id,4,'查看分页与总数信息',()=>this.list.readPagination());
    await this.verify(id,4,{totalPresent:pagination.total>0,size:pagination.size},{totalPresent:true,size:50});this.stateRestored=true;
  }
  @step('验证四档分页与实际商品行数')
  async verifyPagination(id:string) {
    const original=await this.list.readPagination();expect(original.total,'正式前置：商品超过100条').toBeGreaterThan(100);
    const options=await this.list.readSizeOptions();await this.verify(id,1,options,[10,20,50,100]);
    const states:Array<Awaited<ReturnType<StandardListAcceptancePage['readPagination']>>>=[];try {
      states.push(await this.action(id,1,'分页条数切换为10',()=>this.list.selectSize(10)));
      await this.action(id,2,'分页条数依次切换为20、50、100',async()=>{for(const size of [20,50,100])states.push(await this.list.selectSize(size));});
      await this.action(id,3,'观察每档实际展示条数',async()=>{this.observations.paginationStates=states;await this.verify(id,2,states.map(state=>({size:state.size,rows:state.rows})),[10,20,50,100].map(size=>({size,rows:size})));});
    }finally{await test.step('清理：恢复原分页条数',async()=>{const restored=await this.list.selectSize(original.size);expect(restored.size).toBe(original.size);this.stateRestored=true;});}
  }
  @step('验证商品总数量与总金额统计边界')
  async verifyStatistics(id:string) {
    await this.action(id,1,'查看列表统计信息区域',async()=>{const pagination=await this.list.readPagination();const amounts=await this.list.readAmountSummary();await this.verify(id,1,Number.isFinite(pagination.total)&&pagination.total>=0,true);await this.verify(id,2,amounts,[]);});this.stateRestored=true;
  }
  @step('验证列设置选项和规格取消行为')
  async verifySelection(id:string) {
    await this.action(id,1,'打开展示列设置',()=>this.list.openColumns());const columns=await this.list.readColumns();const headers=await this.list.readHeaders();this.observations.selectionSurface={columns,headers};
    // A pinned CSS class describes scrolling, not whether column ordering is locked.
    // Preserve the observed surface; a missing required selection below is a terminal business finding.
    this.observations.fixedPositionQualification='incomplete:尚未通过列设置交互证明全部固定列位置不可变';
    await this.action(id,2,'勾选分类、规格、标准价',async()=>{const required=['Category','Specification','Price($)'];const missing=required.filter(name=>!columns.some(c=>c.name===name));if(missing.length)throw Error('BUSINESS_CONTROL_ABSENT:'+missing.join(','));for(const name of required)await this.list.selectColumn(name,true);});
    const selected=await this.action(id,3,'查看列表字段展示',()=>this.list.readHeaders());await this.verify(id,2,['Category','Specification','Price($)'].filter(name=>selected.some(h=>h.name===name)),['Category','Specification','Price($)']);
    await this.action(id,4,'取消勾选规格',()=>this.list.selectColumn('Specification',false));
    const removed=await this.action(id,5,'再次查看列表字段展示',()=>this.list.readHeaders());await this.verify(id,3,removed.map(h=>h.name),selected.map(h=>h.name).filter(name=>name!=='Specification'));
    throw Error('EVIDENCE_INCOMPLETE:固定列锁定位置尚无完整行为证据');
  }
  @step('验证系统默认列和还原默认行为')
  async verifyDefaults(id:string) {
    const expectedShown=['Item','Type','Specification','Price($)','Status'];
    const expectedHidden=['Item(Alt.Language)','Mnemonic Code','Category','Unit','Flavor','Preparation','Descriptions','Badges','Stats','Allergens','Action Time'];
    // Reset establishes an explicit default context; it is never inferred from entry preferences.
    await this.list.clickRestoreDefaults();await this.list.openColumns();const defaults=await this.list.readColumns();await this.list.closeColumns();const defaultHeaders=await this.list.readHeaders();this.observations.systemDefaults={columns:defaults,headers:defaultHeaders};
    if(id==='TC-ITEM-STD-072') {
      const headers=await this.action(id,1,'查看列表默认展示列',()=>this.list.readHeaders());await this.verify(id,1,expectedShown.filter(name=>headers.some(h=>h.name===name)),expectedShown);
      await this.action(id,2,'打开列设置查看默认收起列',()=>this.list.openColumns());const current=await this.list.readColumns();await this.verify(id,2,expectedHidden.filter(name=>current.some(c=>c.name===name&&!c.checked)),expectedHidden);
    } else {
      await this.action(id,1,'打开列设置并修改分类勾选状态',async()=>{await this.list.openColumns();const category=defaults.find(c=>c.name==='Category');expect(category).toBeDefined();await this.list.selectColumn('Category',!category!.checked);expect(await this.list.readColumns()).not.toEqual(defaults);});
      await this.action(id,2,'点击还原默认状态',()=>this.list.clickRestoreDefaults());await this.list.openColumns();await this.verify(id,1,await this.list.readColumns(),defaults);await this.list.closeColumns();await this.verify(id,2,await this.list.readHeaders(),defaultHeaders);
    }
  }
}
