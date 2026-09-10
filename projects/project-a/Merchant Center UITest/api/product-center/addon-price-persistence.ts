import type {APIRequestContext} from '@playwright/test';
import {callOperation} from '../operation-client';
import type {ProductCenterApi} from './product-center-api';
import type {CleanupRegistry} from './cleanup-registry';
import fs from 'node:fs';
import {publishImmutableArtifact} from '../../../Test Automation Platform/src/utils/immutable-artifact';
import {fingerprintExecutionIntent} from '../../../Test Automation Platform/src/governance/execution-intent';
export type AddonPriceOwnership={caseId:string;auditIdentity:string;actualFormalName:string;serverId?:number;absenceVerified:true};
export type AddonPriceOwnershipWriter=(entry:AddonPriceOwnership)=>void;
export function createAddonPriceOwnershipWriter(outputRoot:string,runId:string,intentPath:string):AddonPriceOwnershipWriter{
 if(!runId||!intentPath)throw Error('ADDON_PRICE_OWNERSHIP_RUN_INTENT_REQUIRED');
 const intent=JSON.parse(fs.readFileSync(intentPath,'utf8'));
 const intentFingerprint=fingerprintExecutionIntent(intent);
 return entry=>{
  if(!/^AUTO_AUDIT_[A-Za-z0-9_]+$/.test(entry.auditIdentity))throw Error('ADDON_PRICE_OWNERSHIP_IDENTITY_INVALID');
  if(!intent.selectedCaseIds?.includes(entry.caseId))throw Error('ADDON_PRICE_OWNERSHIP_CASE_NOT_SELECTED');
  publishImmutableArtifact({outputRoot,relativePath:`output/checkpoints/addon-price-ownership/${entry.auditIdentity}${entry.serverId===undefined?'':`-${entry.serverId}`}.json`,content:JSON.stringify({...entry,runId,intentPath,intentFingerprint,recordedAt:new Date().toISOString()},null,2)+'\n',reason:'persist-source-name-ownership-before-cleanup-ledger-registration'});
 };
}
export type AddonPriceRecord={id:number;name:string};
export function readAddonPriceQuery(body:unknown,name:string):AddonPriceRecord[]{
 const response=body as {success?:boolean;data?:{totalCount?:number;list?:Array<{itemBasic?:{id?:unknown;name?:unknown}}>}};
 if(!response||response.success===false||!Array.isArray(response.data?.list)||!Number.isSafeInteger(response.data.totalCount)||response.data.totalCount!<0||response.data.totalCount!==response.data.list.length)throw Error('ADDON_PRICE_QUERY_EVIDENCE_INCOMPLETE');
 const records=response.data.list.map(row=>{if(!Number.isSafeInteger(row.itemBasic?.id)||Number(row.itemBasic?.id)<=0||typeof row.itemBasic?.name!=='string')throw Error('ADDON_PRICE_QUERY_IDENTITY_INCOMPLETE');return {id:row.itemBasic!.id as number,name:row.itemBasic!.name as string};});
 if(new Set(records.map(r=>r.id)).size!==records.length)throw Error('ADDON_PRICE_QUERY_DUPLICATE_SERVER_ID');return records.filter(r=>r.name===name);
}
export function readAddonPriceCreatedId(body:unknown):number|undefined{
 if(!body||typeof body!=='object')return undefined;const r=body as {success?:boolean;data?:unknown;id?:unknown};if(r.success===false)return undefined;
 const data=r.data,id=typeof data==='number'||typeof data==='string'?Number(data):data&&typeof data==='object'?Number((data as {id?:unknown}).id):Number(r.id);
 return Number.isSafeInteger(id)&&id>0?id:undefined;
}
export class AddonPricePersistence {
 private name:string|undefined;private registrationIdentity:string|undefined;private caseId:string|undefined;
 readonly registeredServerIds=new Set<number>();
 constructor(private readonly request:APIRequestContext,private readonly api:Pick<ProductCenterApi,'deleteBomProduct'|'productDetail'>,private readonly cleanupRegistry:CleanupRegistry,private readonly writeOwnership:AddonPriceOwnershipWriter){}
 async records(name=this.name){if(!name)throw Error('ADDON_PRICE_IDENTITY_NOT_PREPARED');const response=await callOperation(this.request,'brand-menu:POST /ops-brand/brand-items/pageQuery',{body:{pageNumber:1,pageSize:100,name}});if(!response.ok())throw Error('ADDON_PRICE_QUERY_HTTP_INCOMPLETE');return readAddonPriceQuery(await response.json(),name);}
 async readDetail(id:number){const body=await this.api.productDetail(id);return body;}
 async prepare(name:string,caseId:string){if(this.name)throw Error('ADDON_PRICE_CONTEXT_ALREADY_PREPARED');const records=await this.records(name);if(records.length)throw Error('ADDON_PRICE_SOURCE_NAME_ALREADY_EXISTS');this.name=name;this.caseId=caseId;this.registrationIdentity=`AUTO_AUDIT_${caseId.replace(/-/g,'_')}_${Date.now()}`;this.writeOwnership({caseId,auditIdentity:this.registrationIdentity,actualFormalName:name,absenceVerified:true});return {name,exactCount:0,observationChannel:'api',requestKind:'read-only-name-query'};}
 registerResponse(body:unknown){const id=readAddonPriceCreatedId(body);if(id!==undefined)this.registerId(id);return id;}
 private async existsById(id:number){
  let value:unknown;try{value=await this.api.productDetail(id);}catch(error){if(/item id not exist|HTTP 404/i.test(String(error)))return false;throw error;}
  const r=value as {data?:{itemBasic?:{id?:unknown};id?:unknown};id?:unknown},actual=Number(r?.data?.itemBasic?.id??r?.data?.id??r?.id);
  if(!Number.isSafeInteger(actual)||actual<=0)throw Error('ADDON_PRICE_DETAIL_ID_EVIDENCE_INCOMPLETE');if(actual!==id)throw Error('ADDON_PRICE_DETAIL_ID_MISMATCH');return true;
 }
 private registerId(id:number){
  if(!this.name||!this.registrationIdentity)throw Error('ADDON_PRICE_CREATED_BEFORE_ABSENCE_CHECK');if(this.registeredServerIds.has(id))return;
  const name=this.name;
  this.writeOwnership({caseId:this.caseId!,auditIdentity:this.registrationIdentity,actualFormalName:name,serverId:id,absenceVerified:true});
  this.cleanupRegistry.register({entity:'加料商品',identity:this.registrationIdentity,checkpoint:{entryId:`item-${id}`,entityKind:'item',serverId:id,identityVariants:[this.registrationIdentity],cleanupOrder:50},execute:async()=>{
   const current=await this.records(name);
   if(!current.some(r=>r.id===id)){if(await this.existsById(id))throw Error('ADDON_PRICE_CLEANUP_IDENTITY_DRIFT');return;}
   let deletionError:unknown;try{await this.api.deleteBomProduct(id);}catch(error){deletionError=error;}
   const remains=await this.existsById(id);if(remains)throw deletionError??Error('ADDON_PRICE_CLEANUP_ID_REMAINS');
  },verify:async()=>!await this.existsById(id)&&!(await this.records(name)).some(r=>r.id===id)});
  this.registeredServerIds.add(id);
 }
 async reconcile(){const records=await this.records();for(const r of records)this.registerId(r.id);return records;}
 async cleanup(){await this.reconcile();const receipt=await this.cleanupRegistry.cleanupAll();const records=await this.records();if(records.length)throw Error('ADDON_PRICE_FINAL_API_RESIDUE');return {...receipt,exactBusinessName:this.name,exactNameCount:0,registeredServerIds:[...this.registeredServerIds]};}
}
