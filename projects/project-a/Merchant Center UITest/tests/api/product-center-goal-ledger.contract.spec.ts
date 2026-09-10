import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {reconcileItemGoalScope} from '../../scripts/build-seven-goal-case-ledger';
import {recordProductCenterWorkUnit,assertProductCenterWorkUnitMayStart} from '../../adapters/product-center/product-center-work-unit-stop-loss';
import {fingerprintExecutionSelection} from '../../../Test Automation Platform/src/governance/execution-intent';
test('逐案清单拒绝漏案、重复和不适用重叠',()=>{expect(reconcileItemGoalScope(['a','b'],['a'],['b']).missing).toEqual([]);expect(()=>reconcileItemGoalScope(['a','b'],['a'],[])).toThrow();expect(()=>reconcileItemGoalScope(['a','a'],['a'],[])).toThrow();expect(()=>reconcileItemGoalScope(['a','b'],['a'],['a','b'])).toThrow();});
test('项目止损必须验证文件真实指纹，缺失或变化不能作为新证据',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-unit-contract-'));const body='synthetic-evidence';fs.writeFileSync(path.join(root,'evidence.json'),body);
  const input={unitId:'unit',directionId:'neutral',phase:'after-unit' as const,tokenStart:null,tokenCurrent:null,elapsedMs:1,attempts:1,beforeQuestionIds:['a'],afterQuestionIds:[],priorEvidenceHashes:[],evidence:[{path:'evidence.json',sha256:createHash('sha256').update(body).digest('hex'),kind:'diagnosis' as const}],policy:{maxTokens:1000,maxElapsedMs:1000,maxAttempts:2}};
  try{expect(recordProductCenterWorkUnit(root,input).decision).toBe('continue');fs.writeFileSync(path.join(root,'evidence.json'),'changed');expect(()=>recordProductCenterWorkUnit(root,input)).toThrow('WORK_UNIT_EVIDENCE_DRIFT');expect(()=>recordProductCenterWorkUnit(root,{...input,evidence:[{...input.evidence[0],path:'missing.json'}]})).toThrow('WORK_UNIT_EVIDENCE_MISSING');}finally{if(path.dirname(root)!==path.resolve(os.tmpdir()))throw Error('TEMP_PATH_OUTSIDE_ROOT');fs.rmSync(root,{recursive:true,force:true});}
});
test('启动前阻断旧成本样本、选择漂移与重复启动凭据',()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'tap-start-guard-'));
  const input={unitId:'single',directionId:'neutral',phase:'before-start',tokenStart:1,tokenCurrent:2,elapsedMs:0,attempts:0,beforeQuestionIds:['a'],afterQuestionIds:['a'],priorEvidenceHashes:[],evidence:[],policy:{maxTokens:100,maxElapsedMs:1000,maxAttempts:2}};
  const save=(sampledAt:string)=>fs.writeFileSync(path.join(root,'guard.json'),JSON.stringify({input,runId:'run',selectionFingerprint:fingerprintExecutionSelection(['a']),sampledAt}));
  try{save(new Date(Date.now()-130000).toISOString());expect(()=>assertProductCenterWorkUnitMayStart(root,'guard.json',{runId:'run',caseIds:['a']})).toThrow('WORK_UNIT_COST_SAMPLE_STALE');save(new Date().toISOString());expect(()=>assertProductCenterWorkUnitMayStart(root,'guard.json',{runId:'run',caseIds:['b']})).toThrow('WORK_UNIT_SELECTION_DRIFT');expect(assertProductCenterWorkUnitMayStart(root,'guard.json',{runId:'run',caseIds:['a']}).decision).toBe('continue');expect(()=>assertProductCenterWorkUnitMayStart(root,'guard.json',{runId:'run',caseIds:['a']})).toThrow('WORK_UNIT_ALREADY_STARTED');}finally{if(path.dirname(root)!==path.resolve(os.tmpdir()))throw Error('TEMP_PATH_OUTSIDE_ROOT');fs.rmSync(root,{recursive:true,force:true});}
});
