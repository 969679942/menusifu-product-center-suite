import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
const root=path.resolve(process.argv[2]||'.');
const auditRoot=path.resolve(process.argv[3]||'D:/Menusifu/TestOps');
const auditPath=path.join(auditRoot,'artifacts','menusifu-final-audit-report.json');
const outputDir=path.join(root,'contracts','product-center');
const audit=JSON.parse(await fs.readFile(auditPath,'utf8'));
const operations=JSON.parse(await fs.readFile(path.join(root,'contracts','api','operations','all.operations.json'),'utf8'));
const apiUnresolved=JSON.parse(await fs.readFile(path.join(root,'contracts','api','unresolved-api-contracts.json'),'utf8'));
const businessRulesPath=path.join(root,'Merchant Center Info','商品中心业务规则.md');
const businessRulesText=await fs.readFile(businessRulesPath,'utf8');
const sourcePriority=['ui-api-runtime','reproducible-api-probe','openapi','confirmed-prd-or-formal-case','design-standard-or-br','xmind','unverified-ai-rule'];
const hash=value=>crypto.createHash('sha1').update(String(value)).digest('hex').slice(0,12);
const src=value=>[{path:value&&String(value).startsWith('artifacts')?path.join(auditRoot,String(value)):String(value||auditPath)}];
function wrap(record,id,status='observed',sourceType='ui-runtime',confidence=1,generationAllowed=true){const sourceValue=record?.source||record?.evidence||auditPath;return{id,status,sourceType,confidence,generationAllowed,source:src(sourceValue),route:record?.route||record?.href||undefined,entity:record?.entity||undefined,evidence:record};}
function routeId(record,index){return 'route:'+hash(record.href||record.name||index);}
function parameterPathRegex(template){const escaped=template.replace(/[.*+?^${}()|[\]\\]/g,'\\$&').replace(/\\\{[^}]+\\\}/g,'[^/]+');return new RegExp(escaped+'$');}
function pathnameOf(value){try{return new URL(value).pathname;}catch{return String(value||'').split('?')[0];}}
const routes=audit.routes.map((record,index)=>wrap(record,routeId(record,index)));
const controls=audit.controls.map((record,index)=>wrap(record,record.id||'control:'+hash(JSON.stringify(record)+index)));
const fields=audit.fields.map((record,index)=>wrap(record,record.id||'field:'+hash(JSON.stringify(record)+index)));
const dialogs=audit.overlays.map((record,index)=>wrap(record,record.id||'dialog:'+hash(JSON.stringify(record)+index)));
const validations=audit.requiredValidation.map((record,index)=>wrap(record,'validation:'+hash((record.entity||'')+(record.route||'')+index)));
const apiOperations=operations.map(operation=>({id:'operation:'+operation.operationKey,status:'confirmed',sourceType:'openapi',confidence:0.9,generationAllowed:true,source:[{path:path.join(root,'contracts','api','operations',operation.service+'.operations.json'),locator:operation.operationKey}],route:operation.path,evidence:operation}));
const uiApiMappings=[]; const mappingUnresolved=[];
function nonBusinessKind(pathname){if(/^\/(g|j)\/collect/.test(pathname)||/^\/api\/[^/]+\/envelope/.test(pathname))return 'telemetry';if(/^\/(cloud-service\/idp|api\/idp)/.test(pathname))return 'authentication';return null;}
function specificity(operation){return operation.path.split('/').filter(Boolean).reduce((score,segment)=>score+(segment.startsWith('{')?0:1),0);}
for(let index=0;index<audit.network.length;index++){const network=audit.network[index];const pathname=pathnameOf(network.url);const base={route:network.route,actionId:network.actionId,method:network.method,urlPath:pathname,phase:network.phase,statusCode:network.status};const nonBusiness=nonBusinessKind(pathname);if(nonBusiness){uiApiMappings.push({id:'mapping-na:'+hash(JSON.stringify(base)+index),status:'not-applicable',sourceType:'ui-runtime',confidence:1,generationAllowed:false,source:src(network.source),route:network.route,evidence:{...base,classification:nonBusiness,reason:'outside supplied business OpenAPI scope'}});continue;}const candidates=operations.filter(operation=>operation.method===network.method&&parameterPathRegex(operation.path).test(pathname));const ranked=candidates.sort((a,b)=>specificity(b)-specificity(a));const best=ranked[0];const uniqueBest=best&&!ranked.slice(1).some(item=>specificity(item)===specificity(best));if(best&&uniqueBest){uiApiMappings.push({id:'mapping:'+hash(JSON.stringify(base)+best.operationKey),status:'observed',sourceType:'ui-runtime',confidence:candidates.length===1?0.95:0.9,generationAllowed:true,source:src(network.source),route:network.route,evidence:{...base,operationKey:best.operationKey,candidateCount:candidates.length}});}else{mappingUnresolved.push({id:'mapping-unresolved:'+hash(JSON.stringify(base)+index),status:'unresolved',sourceType:'ui-runtime',confidence:candidates.length?0.4:0.2,generationAllowed:false,source:src(network.source),route:network.route,evidence:{...base,candidateOperationKeys:candidates.map(item=>item.operationKey),reason:candidates.length?'ambiguous-operation-match':'no-operation-match'}});}}
const ruleHeadings=businessRulesText.split(/\r?\n/).filter(line=>/^## \d+\./.test(line));
const businessRules=ruleHeadings.map((heading,index)=>({id:'business-rule-section:'+String(index).padStart(2,'0'),status:'provisional',sourceType:'ai-rule',confidence:0.45,generationAllowed:false,source:[{path:businessRulesPath,locator:heading}],module:heading.replace(/^## \d+\.\s*/,''),evidence:{heading,reason:'AI-assisted and manually corrected source requires runtime or product confirmation'}}));
const testDataFactories=audit.crud.map((record,index)=>({id:'factory:'+hash(record.entity||index),status:'provisional',sourceType:'generated',confidence:0.5,generationAllowed:false,source:[{path:auditPath,locator:'crud['+index+']'}],entity:record.entity,route:record.route,evidence:{requiredPrefix:'AUTO_AUDIT_',crudEvidence:record,implementationStatus:'pending'}}));
const cleanupAdapters=audit.crud.map((record,index)=>({id:'cleanup:'+hash(record.entity||index),status:'observed',sourceType:'ui-runtime',confidence:0.85,generationAllowed:false,source:src(record.source),entity:record.entity,route:record.route,evidence:{crudEvidence:record,implementationStatus:'project-specific-adapter-required'}}));
const assertions=Object.entries(audit.acceptance||{}).map(([key,value])=>({id:'acceptance:'+key,status:value===true?'observed':'unresolved',sourceType:'ui-runtime',confidence:value===true?1:0.5,generationAllowed:value===true,source:[{path:auditPath,locator:'acceptance.'+key}],evidence:{key,value}}));
const traceability=controls.map(control=>({id:'trace:'+hash(control.id),status:'generated',sourceType:'generated',confidence:1,generationAllowed:false,source:control.source,route:control.route,evidence:{controlId:control.id,route:control.route}}));
const unresolved=apiUnresolved.map((item,index)=>({id:'api-unresolved:'+hash(JSON.stringify(item)+index),status:'unresolved',sourceType:'openapi',confidence:0.8,generationAllowed:false,source:[{path:path.join(root,'contracts','api','unresolved-api-contracts.json'),locator:'['+index+']'}],evidence:item})).concat(mappingUnresolved);
const contract={metadata:{contractVersion:'0.1.0',generatedAt:new Date().toISOString(),sourcePriority,sourceArtifacts:[auditPath,path.join(root,'contracts','api','operations','all.operations.json'),businessRulesPath],counts:{}},routes,controls,fields,dialogs,validations,apiOperations,uiApiMappings,businessRules,testDataFactories,cleanupAdapters,assertions,traceability,unresolved};
for(const key of ['routes','controls','fields','dialogs','validations','apiOperations','uiApiMappings','businessRules','testDataFactories','cleanupAdapters','assertions','traceability','unresolved'])contract.metadata.counts[key]=contract[key].length;
await fs.mkdir(outputDir,{recursive:true});
for(const key of ['routes','controls','fields','dialogs','validations','apiOperations','uiApiMappings','businessRules','testDataFactories','cleanupAdapters','assertions','traceability','unresolved'])await fs.writeFile(path.join(outputDir,key+'.json'),JSON.stringify(contract[key],null,2)+'\n');
await fs.writeFile(path.join(outputDir,'product-center-test-contract.json'),JSON.stringify(contract,null,2)+'\n');
console.log(JSON.stringify({output:path.join(outputDir,'product-center-test-contract.json'),counts:contract.metadata.counts,mappingCoverage:{network:audit.network.length,mapped:uiApiMappings.length,unresolved:mappingUnresolved.length}},null,2));
