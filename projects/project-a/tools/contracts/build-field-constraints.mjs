import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,"../..");
const dir=path.join(root,"contracts/product-center");
const read=async p=>JSON.parse(await fs.readFile(p,"utf8"));
const write=async(p,v)=>fs.writeFile(p,JSON.stringify(v,null,2)+"\n");
const clean=v=>String(v??"").replace(/\s+/g," ").trim();
const fields=await read(path.join(dir,"fields.json"));
const contractPath=path.join(dir,"product-center-test-contract.json");
const contract=await read(contractPath);
const live=await read(path.join(dir,"live-dom-inventory.json"));
const liveByRoute=new Map((live.routes??[]).map(route=>[route.route,route]));
const validation=await read(path.resolve(root,"../TestOps/artifacts/required-validation-final.json"));
const validationByRoute=new Map((validation.cases??[]).map(item=>[item.route,item]));
function matchesValidation(field, item){
  if(!item)return false;
  const hay=[field.evidence?.label,field.evidence?.placeholder,field.evidence?.name].map(clean).filter(Boolean).join(" ");
  return item.fields.some(name=>{const target=clean(name);return target&&((hay&&hay.includes(target))||(target&&hay&&target.includes(hay)))}) || (item.fields.length===1 && !hay);
}
function nativeFromLive(field){
  if(!String(field.id).includes("#field-"))return [];
  const route=liveByRoute.get(field.route); const index=Number(field.evidence?.index);
  const elements=(route?.elements??[]).filter(x=>["INPUT","TEXTAREA","SELECT"].includes(x.tag));
  const candidate=elements.find(x=>x.index===index) ?? elements.find(x=>x.placeholder===field.evidence?.placeholder && x.type===field.evidence?.type);
  return candidate?[{tag:candidate.tag,type:candidate.type,name:candidate.name??"",placeholder:candidate.placeholder??"",required:Boolean(candidate.required),minLength:candidate.minLength??null,maxLength:candidate.maxLength??null,min:candidate.min??null,max:candidate.max??null,step:candidate.step??null,pattern:candidate.pattern??null,accept:candidate.accept??null,multiple:Boolean(candidate.multiple),readOnly:Boolean(candidate.readOnly)}]:[];
}
const constraints=fields.map(field=>{
  const evidence=field.evidence??{}; const liveMatches=nativeFromLive(field); const validationCase=validationByRoute.get(field.route); const validationObserved=matchesValidation(field,validationCase);
  const type=String(evidence.type||evidence.tag||"").toLowerCase();
  const unknowns=(type==='text'||type==='search'||type==='textarea'||type==='number')?{characterSet:"not-probed",semanticMaxLength:"not-probed",crossFieldRule:"not-probed"}:{};
  const source=[...(field.source??[])]; if(validationObserved&&validationCase?.source)source.push({path:validationCase.source,locator:`cases[?route=${field.route}]`});
  return {id:`field-constraint:${field.id}`,status:"observed",sourceType:"ui-runtime",confidence:validationObserved?0.98:(liveMatches.length?0.95:0.82),generationAllowed:true,source,route:field.route,evidence:{fieldId:field.id,route:field.route,overlayId:evidence.overlayId??null,label:evidence.label??"",placeholder:evidence.placeholder??"",name:evidence.name??"",type:evidence.type??"",required:Boolean(evidence.required),disabled:Boolean(evidence.disabled),tag:evidence.tag??"",liveMatches,requiredValidation:validationObserved?{status:"observed",entity:validationCase.entity,fields:validationCase.fields,behavior:validationCase.behavior,source:validationCase.source}:null,nativeValidity:{required:Boolean(evidence.required),disabled:Boolean(evidence.disabled)},unknowns}};
});
const oldUnresolved=contract.unresolved??[];
contract.fieldConstraints=constraints;
contract.unresolved=oldUnresolved.filter(record=>!String(record.id).startsWith("field-constraint-unresolved:"));
contract.metadata.generatedAt=new Date().toISOString();
contract.metadata.counts.fieldConstraints=constraints.length;
contract.metadata.counts.unresolved=contract.unresolved.length;
await write(path.join(dir,"field-constraints.json"),constraints);
await write(path.join(dir,"field-constraint-unresolved.json"),[]);
await write(contractPath,contract);
console.log(JSON.stringify({fields:fields.length,constraints:constraints.length,requiredEvidence:constraints.filter(x=>x.evidence.requiredValidation).length,liveNativeMatches:constraints.filter(x=>x.evidence.liveMatches.length).length,unknownTextConstraints:constraints.filter(x=>Object.keys(x.evidence.unknowns).length).length,unresolved:contract.unresolved.length},null,2));
