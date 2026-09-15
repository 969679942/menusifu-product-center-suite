export function buildAdvancedSettingsSourceName(timestamp:number):string{
  if(!Number.isSafeInteger(timestamp)||timestamp<0)throw Error('ADVANCED_SOURCE_TIMESTAMP_INVALID');
  return `标准商品-创建页高级设置区域默认不展开-${timestamp}`;
}
