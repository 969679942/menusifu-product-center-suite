import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test,expect} from '@playwright/test';
import {fingerprintImplementationCheckpoint, type ImplementationCheckpoint} from '../../src/automation/system-test/system-test-implementation-fingerprint';
import {verifyImplementationFormatEquivalence, type ImplementationFormatBaseline} from '../../src/governance/implementation-format-equivalence';

function fixture(source='// source contract\nexport const rule = (value: number) => value > 0;\n') {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'format-contract-'));
  fs.writeFileSync(path.join(root,'rule.ts'),source);fs.writeFileSync(path.join(root,'config.json'),'{}');
  fs.writeFileSync(path.join(root,'original.bin'),source);
  const checkpoint:ImplementationCheckpoint={requiredCategories:['flow','adapter'],entries:[{category:'flow',path:'rule.ts'},{category:'adapter',path:'config.json'}]};
  const original=fingerprintImplementationCheckpoint(root,checkpoint);
  const baseline:ImplementationFormatBaseline={schemaVersion:'1.0.0',sources:original.sources.map(s=>({...s,...(s.path==='rule.ts'?{snapshotPath:'original.bin'}:{})}))};
  const verify=()=>verifyImplementationFormatEquivalence({projectRoot:root,checkpoint,expectedFingerprint:original.fingerprint,baseline});
  const write=(s:string)=>fs.writeFileSync(path.join(root,'rule.ts'),s);
  const cleanup=()=>{if(!root.startsWith(path.join(os.tmpdir(),'format-contract-')))throw Error('INVALID_TEST_ROOT');fs.rmSync(root,{recursive:true,force:true});};
  return {root,source,checkpoint,original,baseline,verify,write,cleanup};
}
test('完整旧指纹及快照绑定的纯排版可以等价，原指纹不改写',()=>{
  const f=fixture();try{f.write('// source contract\nexport const rule = (value: number) =>\n  value > 0;\n');const result=f.verify();expect(result.accepted).toBe(true);expect(result.changedPaths).toEqual(['rule.ts']);expect(result.currentFingerprint).not.toBe(f.original.fingerprint);}finally{f.cleanup();}
});
for(const [name,source] of [
  ['比较运算','// source contract\nexport const rule = (value: number) => value >= 0;\n'],
  ['常量','// source contract\nexport const rule = (value: number) => value > 1;\n'],
  ['语义注释','// @ts-nocheck\nexport const rule = (value: number) => value > 0;\n'],
  ['损坏语法','export const rule = ('],
] as const)test(`拒绝${name}变化`,()=>{const f=fixture();try{f.write(source);expect(f.verify().accepted).toBe(false);}finally{f.cleanup();}});
test('拒绝不完整依赖、旧指纹不匹配、伪造或缺失快照及越界路径',()=>{
  const f=fixture();try{
    f.write(f.source+'\n');const previous=structuredClone(f.baseline.sources);
    f.baseline.sources.pop();expect(f.verify().reasons).toContain('FORMAT_DEPENDENCY_SET_MISMATCH');f.baseline.sources=structuredClone(previous);
    const rule=()=>f.baseline.sources.find(s=>s.path==='rule.ts')!;
    rule().sha256='a'.repeat(64);expect(f.verify().reasons).toContain('FORMAT_BASELINE_FINGERPRINT_MISMATCH');f.baseline.sources=structuredClone(previous);
    fs.writeFileSync(path.join(f.root,'original.bin'),'forged');expect(f.verify().reasons).toContain('FORMAT_SOURCE_HASH_MISMATCH');fs.writeFileSync(path.join(f.root,'original.bin'),f.source);
    delete rule().snapshotPath;expect(f.verify().reasons).toContain('FORMAT_SNAPSHOT_REQUIRED');rule().snapshotPath='../outside.bin';expect(f.verify().reasons).toContain('FORMAT_PATH_OUTSIDE_ROOT');
  }finally{f.cleanup();}
});
test('配置变化和依赖新增不能借纯排版证明通过',()=>{
  const f=fixture();try{f.write(f.source+'\n');fs.writeFileSync(path.join(f.root,'config.json'),'{"mode":1}');expect(f.verify().reasons).toContain('FORMAT_SOURCE_TYPE_UNSUPPORTED');fs.writeFileSync(path.join(f.root,'config.json'),'{}');f.checkpoint.entries=[...f.checkpoint.entries,{category:'flow',path:'original.bin'}];expect(f.verify().reasons).toContain('FORMAT_DEPENDENCY_SET_MISMATCH');}finally{f.cleanup();}
});
test('字符串空格和自动分号造成的返回值变化不能当作排版',()=>{
  for(const [before,after] of [["export const x='a b';","export const x='ab';"],['export function rule(){return 1;}','export function rule(){return\n1;}']]){
    const f=fixture(before);try{f.write(after);expect(f.verify().reasons).toContain('FORMAT_SYNTAX_CHANGED');}finally{f.cleanup();}
  }
});
test('注释移动到不同语句不能当作纯排版',()=>{
  const f=fixture('// @ts-ignore\nexport const x = 1;\nexport const y = 2;\n');
  try{f.write('export const x = 1;\n// @ts-ignore\nexport const y = 2;\n');expect(f.verify().reasons).toContain('FORMAT_SYNTAX_CHANGED');}finally{f.cleanup();}
});
