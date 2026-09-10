import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {auditProductCenterItemReleaseReadiness} from './audit-product-center-item-release-readiness';
import {parseProductCenterItemCaseSemanticFingerprints} from '../utils/product-center-item-case-semantic-fingerprint';
import {productCenterItemImplementationCheckpoint,fingerprintProductCenterItemImplementation} from '../adapters/product-center/product-center-item-implementation';
import {loadProductCenterExecutionDecisions} from '../utils/product-center-execution-decisions';
import {publishImmutableArtifact} from '../utils/immutable-artifact';
import {ITEM_CURRENT_RECEIPT_CONTRACT_PATH} from '../adapters/product-center/product-center-item-release-receipts';

export function reconcileItemGoalScope(historical:string[],current:string[],exclusions:string[]) {
  for(const ids of [historical,current,exclusions])if(new Set(ids).size!==ids.length)throw Error('DUPLICATE_SCOPE_CASE');
  const missing=historical.filter(id=>!current.includes(id)&&!exclusions.includes(id));
  const unexpected=current.filter(id=>!historical.includes(id));
  const overlap=current.filter(id=>exclusions.includes(id));
  if(missing.length||unexpected.length||overlap.length)throw Error(`SCOPE_UNRECONCILED:${JSON.stringify({missing,unexpected,overlap})}`);
  return {historical:historical.length,required:current.length,classifiedExclusions:exclusions.length,missing,unexpected,overlap};
}

export function buildSevenGoalCaseLedger(root=process.cwd()) {
  auditProductCenterItemReleaseReadiness(root);
  const read=(relative:string)=>JSON.parse(fs.readFileSync(path.resolve(root,relative),'utf8'));
  const sha=(relative:string)=>createHash('sha256').update(fs.readFileSync(path.resolve(root,relative))).digest('hex');
  const source='../Merchant Center Info/00-待转换测试方案/用例库/商品中心-商品管理-商品/1.商品中心-商品管理-商品-正式测试用例.md';
  const formal=new Map(parseProductCenterItemCaseSemanticFingerprints(path.resolve(root,source)).map(item=>[item.caseId,item]));
  const reconciliation=read('deliverables/system-test-platform/first-batch-admission-reconciliation.json');
  const historicalProof=read('deliverables/system-test-platform/current-release-qualification-proof.json');
  const readiness=read('deliverables/system-test-platform/product-center-item-release-readiness.json');
  const conversion=read('output/product-center-item-213-conversion.json');
  const bindings=read('contracts/product-center/test-plan-additional-automation-bindings.json');
  const manifest=read(ITEM_CURRENT_RECEIPT_CONTRACT_PATH);
  const listResult=read('deliverables/system-test-platform/standard-list-unit-result.json');
  const queryResultPath='deliverables/system-test-platform/query-return-unit-result.json';
  const queryResult=fs.existsSync(path.resolve(root,queryResultPath))?read(queryResultPath):undefined;
  const admissionPath='deliverables/system-test-platform/remaining-admission-static-review.json';
  const admission=fs.existsSync(path.resolve(root,admissionPath))?read(admissionPath):undefined;
  const decisions=loadProductCenterExecutionDecisions(root);
  const priorCases=reconciliation.cases.map((item:{caseId:string})=>item.caseId) as string[];
  const excludedId='TC-ITEM-PKG-007';
  const decision=decisions.get(excludedId);
  if(decision?.status!=='not-applicable'||historicalProof.currentReleaseReadiness.receiptContractRequired!==205)throw Error('HISTORICAL_SCOPE_AUTHORITY_MISSING');
  const historical=[...priorCases,excludedId].sort();
  const required=readiness.cases.filter((item:{qualificationStatus:string})=>!['classified-deferred','classified-not-applicable'].includes(item.qualificationStatus)).map((item:{caseId:string})=>item.caseId);
  const scope=reconcileItemGoalScope(historical,required,[excludedId]);
  if(scope.historical!==205||scope.required!==204)throw Error('SCOPE_CARDINALITY_CHANGED_REVIEW_REQUIRED');
  const rows=historical.map(caseId=>{
    const current=readiness.cases.find((item:{caseId:string})=>item.caseId===caseId);
    const item=formal.get(caseId);if(!item)throw Error('FORMAL_SOURCE_MISSING:'+caseId);
    const generated=conversion.cases.find((item:{caseId:string})=>item.caseId===caseId);
    const binding=bindings.bindings.find((item:{caseId:string})=>item.caseId===caseId);
    const contract=manifest.cases.find((item:{caseId:string})=>item.caseId===caseId);
    const staticRow=admission?.rows.find((r:{caseId:string})=>r.caseId===caseId);
    const staticGap=!contract&&staticRow?.formalSemanticFingerprint===item.fingerprint&&staticRow?.currentImplementationFingerprint===fingerprintProductCenterItemImplementation(root,caseId)?staticRow:undefined;
    const queryRow=queryResult?.caseId===caseId?queryResult:undefined;
    const listRow=queryRow??listResult.rows.find((item:{caseId:string})=>item.caseId===caseId);
    const qualified=current.qualificationStatus==='current-receipt-qualified';
    const sourceGap=['TC-ITEM-STD-001','TC-ITEM-STD-004'].includes(caseId);
    const difference=['TC-ITEM-STD-003','TC-ITEM-STD-072','TC-ITEM-STD-103','TC-ITEM-ADD-014'].includes(caseId)||Boolean(queryRow?.productFailureConfirmed);
    const classification=caseId===excludedId?'not-applicable':qualified?'current-qualified':queryRow?queryRow.classification:sourceGap?'source-ambiguity':difference?'product-behavior-difference':caseId==='TC-ITEM-ADD-002'?'implementation-currentness-gap':staticGap?'current-source-receipt-contract-missing':'operation-assertion-contract-review-required';
    const sourceQuestions=qualified||caseId===excludedId?[]:[...item.steps.map((text,index)=>({id:`${caseId}:action-${index+1}`,kind:'source-operation-mapping',sourceText:text})),...item.expectedResults.map((text,index)=>({id:`${caseId}:expectation-${index+1}`,kind:'assertion-observation',sourceText:text}))];
    const blockingDetail=caseId===excludedId?decision.reason:qualified?'当前标准收据已通过现有公共及项目资格合同':caseId==='TC-ITEM-STD-001'?'正式正文步骤/预期存在重复编号及混入导航段，必须恢复来源语义，不能用派生稿自行替代':caseId==='TC-ITEM-STD-004'?'正式来源未定义需校验的控件范围与确切中英文文案':caseId==='TC-ITEM-STD-003'?'当前列设置无规格、标准价勾选项；依赖动作未执行；固定列位置证据不完整':caseId==='TC-ITEM-STD-072'?'恢复默认后收起列表无单位项，与正式预期2不一致':caseId==='TC-ITEM-STD-103'?'emoji名称保存被接受，违反BR-FMT-001；零残留已核验，但完整失败标准收据尚缺':caseId==='TC-ITEM-ADD-014'?'正式来源期望编辑同名返回 BITEM-7014；当前真实编辑返回 BITEM-7010。页面停留且原名称保持，API/UI 零残留已核验，属于错误码语义冲突，等待正式裁决':caseId==='TC-ITEM-ADD-002'?'有历史通过收据；当前相邻方法实质代码变化使实现指纹不匹配，不能按纯排版复用':`尚未建立本用例 ${item.steps.length} 个正式动作及 ${current.sourceSurface.requiredAssertionIds.length} 个断言面的当前收据合同；已登记来源/代码入口，具体实现覆盖尚未逐案验证`;
    const nextAction=qualified?'保留当前运行资格；无真实影响不重跑':caseId===excludedId?'保持既有不适用裁决，追踪已登记替代用例，不执行原场景':sourceGap?'按已登记正式来源缺口提供业务裁决；执行代理负责后续实现、定向执行和证据更新':difference?'保留实际观察；等待产品修复或正式规则裁决。代理补齐依赖的技术证据并仅重验受影响用例':caseId==='TC-ITEM-ADD-002'?'逐依赖确认当前变化对五项设置断言的实际影响，补当前实现/收据协调后按精确影响集处理':`从 ${generated.family} / ${generated.action??generated.handlerId} 入口逐项追踪下列 sourceQuestions；补缺失动作、断言及上下文/恢复映射，再通过公共意图执行当前用例`;
    const resolvedDetail=staticGap?`静态实证：缺少覆盖本条${item.steps.length}个来源动作及${current.sourceSurface.requiredAssertionIds.length}个断言的当前收据验收合同；内嵌实现指纹${staticGap.embeddedFingerprintMatches?'匹配':'不匹配'}；业务语义覆盖仍待逐项核验`:queryRow?.reason??blockingDetail;
    const resolvedNext=staticGap?.nextAction??queryRow?.nextAction??nextAction;
    return {caseId,title:item.title,classification,blockingDetail:resolvedDetail,nextAction:resolvedNext,owner:sourceGap?'business-source-owner':difference?'product-owner-and-execution-agent':'execution-agent',
      scopeMembership:{historical205:true,currentReceiptRequired:caseId!==excludedId},
      formalDisposition:caseId===excludedId?'not-applicable':sourceGap?'blocked-source':difference?'product-defect':'applicable',
      executionStatus:listRow?.runtimeStatus??(qualified?'passed':'not-established-current'),evidenceStatus:qualified?'verified':listRow?.assertions?.length===current.sourceSurface.requiredAssertionIds.length?'observed-with-findings':'incomplete',
      applicabilityStatus:caseId===excludedId?'not-applicable':'applicable',changeObservation:'no-business-rerun-in-this-audit',reuseStatus:qualified?'run-only-derived-unstable':'not-authorized',verificationStatus:qualified?'qualified':'not-qualified',actionRequired:resolvedNext,
      source:{path:source,semanticFingerprint:item.fingerprint,preconditions:item.preconditions,steps:item.steps,expectedResults:item.expectedResults,citations:item.sources,assertionSurface:current.sourceSurface},
      implementation:{canonicalSpec:binding?.scriptPath??'tests/generated/product-center-item-216.generated.spec.ts',family:generated?.family,action:generated?.action,handlerId:binding?.handlerId??generated?.handlerId,fingerprint:fingerprintProductCenterItemImplementation(root,caseId),dependencies:productCenterItemImplementationCheckpoint(caseId).entries,coverageReview:qualified||difference||queryRow?'inspected-for-current-unit':'not-yet-inspected'},
      receipt:{contractPresent:Boolean(contract),qualificationReasons:current.reasons,registeredReportPaths:manifest.reportPaths},sourceQuestions,staticAdmissionEvidence:staticGap?{path:admissionPath,...staticGap}:undefined,
      decision:caseId===excludedId?decision:undefined,detailEvidence:queryRow?queryResultPath:difference||caseId==='TC-ITEM-STD-004'?caseId==='TC-ITEM-STD-103'?'deliverables/system-test-platform/standard-name-103-finding.json':`deliverables/system-test-platform/standard-list-business-decisions/${caseId}.json`:undefined};
  });
  const inputs=[source,'deliverables/system-test-platform/first-batch-admission-reconciliation.json','deliverables/system-test-platform/current-release-qualification-proof.json','contracts/product-center/reviews/product-center-execution-decisions.json','deliverables/system-test-platform/product-center-item-release-readiness.json',ITEM_CURRENT_RECEIPT_CONTRACT_PATH,'deliverables/system-test-platform/standard-list-unit-result.json'];
  if(queryResult)inputs.push(queryResultPath);
  if(admission)inputs.push(admissionPath);
  const summary={...scope,currentQualified:rows.filter(row=>row.classification==='current-qualified').length,notQualified:rows.filter(row=>row.scopeMembership.currentReceiptRequired&&row.classification!=='current-qualified').length,byClassification:Object.fromEntries([...new Set(rows.map(row=>row.classification))].map(value=>[value,rows.filter(row=>row.classification===value).length]))};
  const body={schemaVersion:'1.0.0',recordedAt:new Date().toISOString(),status:'current-disposition-ledger',summary,scopeAuthority:'历史205计数证据+已保存204条逐案对账集合+PKG007既有不适用裁决复原；不是声称找到了历史205行原始快照',inputs:inputs.map(file=>({path:file,sha256:sha(file)})),businessExecuted:0,implementationDeepReviewComplete:false,rows};
  for(const [relativePath,content]of [
    ['deliverables/system-test-platform/seven-goal-case-ledger.json',JSON.stringify(body,null,2)+'\n'],
    ['deliverables/system-test-platform/205条逐案去向清单.md',`205条逐案去向清单\n\n历史205 = 当前需收据204 + PKG007既有不适用1；当前合格${summary.currentQualified}，未合格${summary.notQualified}。以下每条均有来源、实现依赖、断言面、真实已知缺口及下一步，完整细节在同名JSON中。${(summary.byClassification['operation-assertion-contract-review-required']??0)+(summary.byClassification['current-source-receipt-contract-missing']??0)}条尚未逐案深查实现，明确标记未知，不冒充审查完成。\n\n|用例|标题|去向|具体阻断|下一步|\n|---|---|---|---|---|\n${rows.map(row=>`|${row.caseId}|${row.title.replaceAll('|','/')}|${row.classification}|${row.blockingDetail}|${row.nextAction}|`).join('\n')}\n`],
  ])publishImmutableArtifact({outputRoot:root,relativePath,content,reason:'reconcile-historical205-to-current204-and-refresh-each-case-disposition-without-business-execution'});
  return summary;
}
if(require.main===module)console.log(JSON.stringify(buildSevenGoalCaseLedger()));


