import type {APIRequestContext} from '@playwright/test';
import {callOperation} from '../operation-client';
export function readAdvancedSourceNameCount(name:string,body:unknown):number{
  const response=body as {success?:boolean;data?:{list?:Array<{itemBasic?:{name?:unknown}}> ;totalCount?:number}};
  if(!response||response.success===false||!Array.isArray(response.data?.list)||!Number.isSafeInteger(response.data.totalCount)||response.data.totalCount!<0||response.data.totalCount!==response.data.list.length)throw Error('ADVANCED_NAME_QUERY_EVIDENCE_INCOMPLETE');
  if(response.data.list.some(row=>typeof row.itemBasic?.name!=='string'))throw Error('ADVANCED_NAME_QUERY_IDENTITY_MISSING');
  return response.data.list.filter(row=>row.itemBasic!.name===name).length;
}
export async function verifyAdvancedSettingsSourceNameAvailable(request:APIRequestContext,name:string){
  const response=await callOperation(request,'brand-menu:POST /ops-brand/brand-items/pageQuery',{body:{pageNumber:1,pageSize:100,name}});
  if(!response.ok())throw Error('ADVANCED_SOURCE_NAME_QUERY_HTTP_INCOMPLETE');
  const exactCount=readAdvancedSourceNameCount(name,await response.json());
  if(exactCount!==0)throw Error('ADVANCED_SOURCE_NAME_ALREADY_EXISTS');
  return {name,exactCount,observationChannel:'api',requestKind:'read-only-name-query'};
}
