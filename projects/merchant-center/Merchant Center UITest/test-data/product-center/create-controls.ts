export function buildCreateControlsSourceName(caseId:string,timestamp:number):string|undefined{
  if(!Number.isSafeInteger(timestamp)||timestamp<0)throw Error('SOURCE_TIMESTAMP_INVALID');
  if(caseId==='TC-ITEM-STD-045')return `标准商品-商品描述达到500字符后输入框不可继续录-${timestamp}`;
  if(caseId==='TC-ITEM-STD-048')return `商品-多规格商品点击去创建可跳转规格组新增页-${timestamp}`;
  if(caseId==='TC-ITEM-STD-049')return undefined;
  throw Error('UNKNOWN_CREATE_CONTROLS_SOURCE');
}
