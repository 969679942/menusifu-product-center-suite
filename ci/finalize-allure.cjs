const fs=require('node:fs'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest,verifyReportSelection}=require('../tap/src/ci/result-bundle.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/ci');
const scope=process.env.RUN_SCOPE;
const envelopePath=path.join(out,scope==='pilot'?'pilot-envelope.json':'result-envelope.json');
const envelope=fs.existsSync(envelopePath)?JSON.parse(fs.readFileSync(envelopePath,'utf8')):{};
const businessRoot=path.join(out,'business'),rawDir=path.join(out,'allure-results'),businessDir=path.join(out,'allure-results-business');
const projectCandidates=['projects/project-a/Merchant Center UITest','projects/merchant-center/Merchant Center UITest'];
const projectRoot=projectCandidates.map(rel=>path.join(root,rel)).find(fs.existsSync)||path.join(root,projectCandidates[0]);
const isBusiness=scope==='pilot'||scope==='full-regression';
const caseIdOf=result=>result.labels?.find(label=>label.name==='caseId')?.value || result.labels?.find(label=>label.name==='tag'&&String(label.value).startsWith('case-'))?.value.slice(5);
const moduleOf=caseId=>({FLV:'调味管理',GRP:'商品分组',ITEM:'商品管理',TAG:'标签管理',IMG:'图片管理'})[String(caseId||'').split('-')[1]]||'待归类业务用例';
const labelsFor=(labels,caseId)=>[...labels.filter(label=>!['caseId','tag','parentSuite','suite','subSuite'].includes(label.name)),{name:'caseId',value:caseId},{name:'tag',value:'case-'+caseId},{name:'parentSuite',value:'商品中心'},{name:'suite',value:moduleOf(caseId)},{name:'subSuite',value:'业务用例'}];
const copy=(from,to)=>{if(!fs.existsSync(to))fs.copyFileSync(from,to);};
function resultSources(){const sources=[];if(fs.existsSync(businessRoot))for(const entry of fs.readdirSync(businessRoot))sources.push(path.join(businessRoot,entry,'allure-results'));sources.push(rawDir);return sources.filter(fs.existsSync);}
function normalizeSources(){
 const adapterPath=path.join(projectRoot,'adapters/test-automation-platform/allure-reporting.ts');
 if(!fs.existsSync(adapterPath)) return;
 const tsxRegister=path.join(projectRoot,'node_modules/tsx/dist/cjs/index.cjs');
 if(!fs.existsSync(tsxRegister)) throw new Error(`tsx-register-missing:${tsxRegister}`);
 require(tsxRegister);
 const adapter=require(adapterPath);
 for(const source of resultSources()) adapter.normalizeMerchantCenterAllureResults(source,{playwrightOutputDir:path.join(path.dirname(source),'playwright-business')});
}
function placeholderResult(caseId, status, reason){
 const safeReason=String(reason||'当前运行未生成标准业务结果').replace(/[\r\n]+/g,' ');
 return {uuid:`governed-${caseId}`,name:`${caseId}｜商品中心业务用例`,status,
  statusDetails:{message:safeReason},labels:[{name:'caseId',value:caseId},{name:'tag',value:`case-${caseId}`}],
  steps:[
   {name:'[环境] 登录 → 商品中心 → 全量回归',status:'skipped',stage:'finished',steps:[{name:'前置条件：执行范围已冻结；当前用例未取得可用业务收据。',status:'skipped',stage:'finished'}]},
   {name:`[业务操作] ${caseId}`,status:'skipped',stage:'finished',steps:[{name:'操作1：未执行（缺少当前标准执行收据）。',status:'skipped',stage:'finished'}]},
   {name:`[断言] 核对「${caseId}」预期结果`,status:'skipped',stage:'finished',steps:[{name:`校验1：期望：来源用例声明的业务预期｜实际：${safeReason}｜结果：未执行`,status:'skipped',stage:'finished'}]},
   {name:'[清理] 未产生可核验的持久化变更',status:'skipped',stage:'finished',steps:[{name:'清理校验：期望：无测试数据残留｜实际：未取得当前执行收据，无法确认｜结果：证据不完整',status:'skipped',stage:'finished'}]},
   {name:`执行结论：${status==='skipped'?'未执行':'失败（证据不完整）'}｜${caseId}`,status,stage:'finished',steps:[{name:`结论摘要：${safeReason}`,status,stage:'finished'}]},
  ],attachments:[]};
}
function projectBusinessResults(){
 fs.rmSync(businessDir,{recursive:true,force:true});fs.mkdirSync(businessDir,{recursive:true});
 const scopeIds=new Set(envelope.formalScopeCaseIds||envelope.plannedCaseIds||envelope.selectedCaseIds||[]);
 const selected=new Set(envelope.selectedCaseIds||[]),excluded=new Set(envelope.classifiedExclusions||envelope.classifiedExclusionCaseIds||[]),chosen=new Map();
 for(const source of resultSources())for(const name of fs.readdirSync(source)){const from=path.join(source,name);if(!fs.statSync(from).isFile())continue;if(!name.endsWith('-result.json')){copy(from,path.join(businessDir,name));continue;}const result=JSON.parse(fs.readFileSync(from,'utf8')),caseId=caseIdOf(result);if(!caseId||(scopeIds.size&&!scopeIds.has(caseId)))continue;const score=JSON.stringify(result).length+(result.steps?.length||0)*1000+(result.attachments?.length||0)*1000;const priority=source===rawDir?0:1;const prior=chosen.get(caseId);if(prior&&(prior.priority>priority||(prior.priority===priority&&prior.score>=score)))continue;chosen.set(caseId,{name,source,result,score,priority});}
 for(const caseId of scopeIds){if(chosen.has(caseId))continue;const status=excluded.has(caseId)?'skipped':'failed';chosen.set(caseId,{name:`${caseId}-governed-result.json`,source:'placeholder',result:placeholderResult(caseId,status,excluded.has(caseId)?(envelope.exclusionReasons||{})[caseId]||'已分类排除，未进入执行选择集':'选中用例未生成终态业务收据'),score:0,priority:2});}
 for(const [caseId,item] of chosen){const result=item.result;result.labels=labelsFor(result.labels||[],caseId);const target=path.join(businessDir,item.name);fs.writeFileSync(target,JSON.stringify(result));}
 return [...chosen.keys()];
}
function writeExecutionReport(audit,published){const state=audit.status==='complete'?'COMPLETE':'INCOMPLETE',reason=audit.reason||audit.selection?.reason||'none';fs.writeFileSync(path.join(out,'execution-report.html'),`<!doctype html><meta charset="utf-8"><title>商品中心执行报告</title><style>body{font:16px Microsoft YaHei;margin:36px;color:#172b4d}strong{color:${state==='COMPLETE'?'#087f5b':'#b42318'}}code{background:#f1f5f9;padding:2px 5px}</style><h1>商品中心执行报告：<strong>${state}</strong></h1><p>范围：<code>${scope||'unknown'}</code>；构建：<code>${process.env.BUILD_NUMBER||'unknown'}</code></p><p>Allure 业务结果：${published} 条。只统计带 caseId 的业务结果；setup、chrome 项目名、合同和辅助测试均不计入业务结果。</p><p>审计原因：<code>${reason}</code></p><p>业务通过资格取决于选择集、终态收据和 Allure 审计同时完整，不能以本页或 Jenkins SUCCESS 代替。</p>`);}
let audit={status:'incomplete',reason:'finalizer-not-started'},published=0;
try {
 if(isBusiness) normalizeSources();
 const resultsDir=isBusiness?businessDir:rawDir;if(isBusiness)published=projectBusinessResults().length;else fs.mkdirSync(resultsDir,{recursive:true});
 if(!published&&isBusiness)audit={status:'incomplete',reason:'no-business-allure-results'};else if(!fs.readdirSync(resultsDir).some(name=>name.endsWith('-result.json')))audit={status:'incomplete',reason:'no-allure-results'};else audit=verifyAllureAttachments(resultsDir);
 if(isBusiness&&audit.status==='complete'){const results=fs.readdirSync(resultsDir).filter(name=>name.endsWith('-result.json')).map(name=>JSON.parse(fs.readFileSync(path.join(resultsDir,name),'utf8')));const selectedSet=new Set(envelope.selectedCaseIds||[]);const projected=results.filter(result=>selectedSet.has(caseIdOf(result))).map(result=>({caseId:caseIdOf(result),status:result.status}));const receipts=scope==='full-regression'&&envelope.kind==='governed-business-full-product-center'?(envelope.caseAudit||[]).map(caseAudit=>({caseId:caseAudit.caseId,accepted:caseAudit.accepted===true&&caseAudit.status==='passed'})):fs.existsSync(businessRoot)?fs.readdirSync(businessRoot).map(entry=>path.join(businessRoot,entry,'evidence-ledger.json')).filter(fs.existsSync).flatMap(file=>JSON.parse(fs.readFileSync(file,'utf8')).cases||[]).map(item=>({caseId:item.caseId,accepted:item.playwrightStatus==='passed'&&item.evidence?.status==='complete'&&envelope.receiptAudit?.cases?.find(a=>a.caseId===item.caseId)?.status==='complete'})):[];audit.selection=verifyReportSelection(projected,envelope.selectedCaseIds,receipts);}
}catch(error){audit={status:'incomplete',reason:error.message};}
fs.writeFileSync(path.join(out,'allure-audit.json'),JSON.stringify(audit,null,2));writeExecutionReport(audit,published);
if(isBusiness&&published>0){
 const reason=String(audit.reason||audit.selection?.reason||'none').replace(/[\r\n=]/g,' ');
 fs.writeFileSync(path.join(businessDir,'environment.properties'),`Evidence status=${audit.status==='complete'?'COMPLETE':'INCOMPLETE'}\nAudit reason=${reason}\nRequest ID=${process.env.REQUEST_ID||'unknown'}\n`);
}
if(isBusiness&&published>0)fs.writeFileSync(path.join(out,'allure-business-publishable.marker'),'');
writeBundleManifest(out,{gitSha:envelope.gitSha,buildNumber:String(process.env.BUILD_NUMBER),requestId:process.env.REQUEST_ID,intentId:process.env.INTENT_ID,runScope:scope,selectionFingerprint:envelope.selectionFingerprint,reportStatus:audit.status});
if(audit.status!=='complete')process.exitCode=2;
