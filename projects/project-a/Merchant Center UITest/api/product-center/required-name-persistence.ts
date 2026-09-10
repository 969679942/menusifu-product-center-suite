import type {APIRequestContext} from '@playwright/test';
import {callOperation} from '../operation-client';

export type RequiredNameWrite = {status:'rejected'|'created'|'incomplete'; serverId?:number};
/** Current pageQuery evidence: required-name-list-response-shape.json. */
export function readRequiredNameListPage(body:unknown):{ids:number[];total:number}{
  const response=body as {success?:boolean;data?:{list?:Array<{itemBasic?:{id?:unknown}}> ;totalCount?:number}};
  if(!response||response.success===false||!Array.isArray(response.data?.list)||!Number.isSafeInteger(response.data.totalCount)||response.data.totalCount!<0)throw Error('REQUIRED_NAME_SNAPSHOT_SCHEMA_INCOMPLETE');
  const ids=response.data.list.map(row=>{const id=row.itemBasic?.id;if(typeof id!=='number'||!Number.isSafeInteger(id)||id<=0)throw Error('REQUIRED_NAME_LIST_ID_INCOMPLETE');return id;});
  if(new Set(ids).size!==ids.length)throw Error('REQUIRED_NAME_SNAPSHOT_IDENTITY_DRIFT');
  return {ids,total:response.data.totalCount!};
}
/** Request occurrence is not acceptance. Preserve uncertain transport/business outcomes. */
export function classifyRequiredNameWrite(httpStatus:number,body:unknown):RequiredNameWrite {
  if(httpStatus>=500||httpStatus===429||httpStatus===408)return {status:'incomplete'};
  if([400,409,422].includes(httpStatus))return {status:'rejected'};
  if(httpStatus<200||httpStatus>=300||!body||typeof body!=='object')return {status:'incomplete'};
  const response=body as Record<string,unknown>;
  if(response.success===false)return {status:'rejected'};
  const data=response.data;
  const raw=typeof data==='number'||typeof data==='string'?data:data&&typeof data==='object'?(data as Record<string,unknown>).id:response.id;
  const id=typeof raw==='number'||typeof raw==='string'&&raw.trim()!==''?Number(raw):NaN;
  return Number.isSafeInteger(id)&&id>0?{status:'created',serverId:id}:{status:'incomplete'};
}

export class RequiredNamePersistence {
  constructor(private readonly request:APIRequestContext){}
  async snapshotIds():Promise<number[]> {
    const ids:number[]=[];let total:number|undefined;
    for(let pageNumber=1;pageNumber<=100;pageNumber++) {
      const response=await callOperation(this.request,'brand-menu:POST /ops-brand/brand-items/pageQuery',{body:{pageNumber,pageSize:100}});
      const body=await response.json();
      if(!response.ok())throw Error('REQUIRED_NAME_SNAPSHOT_HTTP_INCOMPLETE');
      const current=readRequiredNameListPage(body);
      if(total!==undefined&&total!==current.total)throw Error('REQUIRED_NAME_CONCURRENT_LIST_CHANGE');
      total=current.total;ids.push(...current.ids);
      if(ids.length>=total!){if(ids.length!==total||new Set(ids).size!==total)throw Error('REQUIRED_NAME_SNAPSHOT_IDENTITY_DRIFT');return ids.sort((a,b)=>a-b);}
      if(!current.ids.length)throw Error('REQUIRED_NAME_SNAPSHOT_TRUNCATED');
    }
    throw Error('REQUIRED_NAME_SNAPSHOT_LIMIT');
  }
  async removeCorrelatedCreation(id:number,beforeIds:readonly number[]):Promise<void> {
    if(!Number.isSafeInteger(id)||id<=0||beforeIds.includes(id))throw Error('REQUIRED_NAME_CLEANUP_IDENTITY_UNSAFE');
    if(!(await this.snapshotIds()).includes(id))return;
    // One deletion only. An uncertain response is reconciled by a read before any further action.
    let deleteError:unknown;
    try{const response=await callOperation(this.request,'brand-menu:DELETE /ops-brand/brand-items/delete',{body:{deleteId:id,force:true}});if(!response.ok())deleteError=Error('REQUIRED_NAME_DELETE_RESPONSE_INCOMPLETE');}catch(error){deleteError=error;}
    if((await this.snapshotIds()).includes(id))throw deleteError??Error('REQUIRED_NAME_CLEANUP_RESIDUE');
  }
}
