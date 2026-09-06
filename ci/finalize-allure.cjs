const fs=require('node:fs'),path=require('node:path');
const {verifyAllureAttachments,writeBundleManifest,verifyReportSelection}=require('../tap/src/ci/result-bundle.cjs');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/ci');
const scope=process.env.RUN_SCOPE;
const envelopePath=path.join(out,scope==='pilot'?'pilot-envelope.json':'result-envelope.json');
const envelope=fs.existsSync(envelopePath)?JSON.parse(fs.readFileSync(envelopePath,'utf8')):{};
const businessRoot=path.join(out,'business'),rawDir=path.join(out,'allure-results'),businessDir=path.join(out,'allure-results-business');
const isBusiness=scope==='pilot'||scope==='full-regression';
const caseIdOf=result=>result.labels?.find(label=>label.name==='caseId')?.value || result.labels?.find(label=>label.name==='tag'&&String(label.value).startsWith('case-'))?.value.slice(5);
const moduleOf=caseId=>({FLV:'调味管理',GRP:'商品分组',ITEM:'商品管理',TAG:'标签管理',IMG:'图片管理'})[String(caseId||'').split('-')[1]]||'待归类业务用例';
const labelsFor=(labels,caseId)=>[...labels.filter(label=>!['caseId','tag','parentSuite','suite','subSuite'].includes(label.name)),{name:'caseId',value:caseId},{name:'tag',value:'case-'+caseId},{name:'parentSuite',value:'商品中心'},{name:'suite',value:moduleOf(caseId)},{name:'subSuite',value:'业务用例'}];
const copy=(from,to)=>{if(!fs.existsSync(to))fs.copyFileSync(from,to);};
function resultSources(){const sources=[rawDir];if(fs.existsSync(businessRoot))for(const entry of fs.readdirSync(businessRoot))sources.push(path.join(businessRoot,entry,'allure-results'));return sources.filter(fs.existsSync);}
function projectBusinessResults(){
 fs.rmSync(businessDir,{recursive:true,force:true});fs.mkdirSync(businessDir,{recursive:true});const selected=new Set(envelope.selectedCaseIds||[]),seen=new Set();
 for(const source of resultSources())for(const name of fs.readdirSync(source)){const from=path.join(source,name);if(!fs.statSync(from).isFile())continue;if(!name.endsWith('-result.json')){copy(from,path.join(businessDir,name));continue;}const result=JSON.parse(fs.readFileSync(from,'utf8')),caseId=caseIdOf(result);if(!caseId||(selected.size&&!selected.has(caseId)))continue;result.labels=labelsFor(result.labels||[],caseId);if(seen.has(name))throw new Error('duplicate-business-allure-result:'+name);seen.add(name);fs.writeFileSync(path.join(businessDir,name),JSON.stringify(result));}
 return [...seen];
}
function writeExecutionReport(audit,published){const state=audit.status==='complete'?'COMPLETE':'INCOMPLETE',reason=audit.reason||audit.selection?.reason||'none';fs.writeFileSync(path.join(out,'execution-report.html'),`<!doctype html><meta charset="utf-8"><title>商品中心执行报告</title><style>body{font:16px Microsoft YaHei;margin:36px;color:#172b4d}strong{color:${state==='COMPLETE'?'#087f5b':'#b42318'}}code{background:#f1f5f9;padding:2px 5px}</style><h1>商品中心执行报告：<strong>${state}</strong></h1><p>范围：<code>${scope||'unknown'}</code>；构建：<code>${process.env.BUILD_NUMBER||'unknown'}</code></p><p>Allure 业务结果：${published} 条。只统计带 caseId 的业务结果；setup、chrome 项目名、合同和辅助测试均不计入业务结果。</p><p>审计原因：<code>${reason}</code></p><p>业务通过资格取决于选择集、终态收据和 Allure 审计同时完整，不能以本页或 Jenkins SUCCESS 代替。</p>`);}
let audit={status:'incomplete',reason:'finalizer-not-started'},published=0;
try {
 const resultsDir=isBusiness?businessDir:rawDir;if(isBusiness)published=projectBusinessResults().length;else fs.mkdirSync(resultsDir,{recursive:true});
 if(!published&&isBusiness)audit={status:'incomplete',reason:'no-business-allure-results'};else if(!fs.readdirSync(resultsDir).some(name=>name.endsWith('-result.json')))audit={status:'incomplete',reason:'no-allure-results'};else audit=verifyAllureAttachments(resultsDir);
 if(isBusiness&&audit.status==='complete'){const results=fs.readdirSync(resultsDir).filter(name=>name.endsWith('-result.json')).map(name=>JSON.parse(fs.readFileSync(path.join(resultsDir,name),'utf8')));const projected=results.map(result=>({caseId:caseIdOf(result),status:result.status}));const receipts=scope==='full-regression'&&envelope.kind==='governed-business-full-product-center'?(envelope.caseAudit||[]).map(caseAudit=>({caseId:caseAudit.caseId,accepted:caseAudit.accepted===true&&caseAudit.status==='passed'})):fs.existsSync(businessRoot)?fs.readdirSync(businessRoot).map(entry=>path.join(businessRoot,entry,'evidence-ledger.json')).filter(fs.existsSync).flatMap(file=>JSON.parse(fs.readFileSync(file,'utf8')).cases||[]).map(item=>({caseId:item.caseId,accepted:item.playwrightStatus==='passed'&&item.evidence?.status==='complete'&&envelope.receiptAudit?.cases?.find(a=>a.caseId===item.caseId)?.status==='complete'})):[];audit.selection=verifyReportSelection(projected,envelope.selectedCaseIds,receipts);}
}catch(error){audit={status:'incomplete',reason:error.message};}
fs.writeFileSync(path.join(out,'allure-audit.json'),JSON.stringify(audit,null,2));writeExecutionReport(audit,published);
if(isBusiness&&published>0){
 const reason=String(audit.reason||audit.selection?.reason||'none').replace(/[\r\n=]/g,' ');
 fs.writeFileSync(path.join(businessDir,'environment.properties'),`Evidence status=${audit.status==='complete'?'COMPLETE':'INCOMPLETE'}\nAudit reason=${reason}\nRequest ID=${process.env.REQUEST_ID||'unknown'}\n`);
}
if(isBusiness&&published>0)fs.writeFileSync(path.join(out,'allure-business-publishable.marker'),'');
writeBundleManifest(out,{gitSha:envelope.gitSha,buildNumber:String(process.env.BUILD_NUMBER),requestId:process.env.REQUEST_ID,intentId:process.env.INTENT_ID,runScope:scope,selectionFingerprint:envelope.selectionFingerprint,reportStatus:audit.status});
if(audit.status!=='complete')process.exitCode=2;
