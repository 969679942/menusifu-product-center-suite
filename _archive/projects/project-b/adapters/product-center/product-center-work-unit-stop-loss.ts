import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {evaluateWorkUnitStopLoss,type WorkUnitObservation} from '../../../Test Automation Platform/src/governance/work-unit-stop-loss';
import {publishImmutableArtifact,resolveContainedArtifactPath} from '../../../Test Automation Platform/src/utils/immutable-artifact';
import {fingerprintExecutionSelection} from '../../../Test Automation Platform/src/governance/execution-intent';

export function recordProductCenterWorkUnit(root:string,input:Omit<WorkUnitObservation,'evidence'>&{evidence:Array<{path:string;sha256:string;kind:WorkUnitObservation['evidence'][number]['kind']}>}) {
  const verified=input.evidence.map(e=>{const file=resolveContainedArtifactPath(root,e.path);if(!fs.existsSync(file))throw Error('WORK_UNIT_EVIDENCE_MISSING');const actual=createHash('sha256').update(fs.readFileSync(file)).digest('hex');if(actual!==e.sha256)throw Error('WORK_UNIT_EVIDENCE_DRIFT');return {...e,verified:true};});
  const result=evaluateWorkUnitStopLoss({...input,evidence:verified});
  const safeId=input.unitId.replace(/[^a-zA-Z0-9_-]/g,'_');
  publishImmutableArtifact({outputRoot:root,relativePath:`deliverables/system-test-platform/work-units/${safeId}-${input.phase}.json`,content:JSON.stringify({recordedAt:new Date().toISOString(),input,result},null,2)+'\n',reason:'record-verified-work-unit-cost-and-progress-stop-loss'});
  return result;
}

export function assertProductCenterWorkUnitMayStart(root:string,relativePath:string,expected:{runId:string;caseIds:string[]}) {
  const observation=JSON.parse(fs.readFileSync(resolveContainedArtifactPath(root,relativePath),'utf8'));
  if(observation.runId!==expected.runId||observation.selectionFingerprint!==fingerprintExecutionSelection(expected.caseIds))throw Error('WORK_UNIT_SELECTION_DRIFT');
  const sampleAge=Date.now()-Date.parse(observation.sampledAt);
  if(!Number.isFinite(sampleAge)||sampleAge<0||sampleAge>120000)throw Error('WORK_UNIT_COST_SAMPLE_STALE');
  const result=recordProductCenterWorkUnit(root,observation.input);
  if(result.decision!=='continue')throw Error('WORK_UNIT_STOP_LOSS:'+result.reasons.join(','));
  const claim=resolveContainedArtifactPath(root,`deliverables/system-test-platform/work-units/claimed-${observation.input.unitId.replace(/[^a-zA-Z0-9_-]/g,'_')}.json`);
  fs.mkdirSync(path.dirname(claim),{recursive:true});
  try{fs.writeFileSync(claim,JSON.stringify({runId:expected.runId,selectionFingerprint:observation.selectionFingerprint,claimedAt:new Date().toISOString()}),{flag:'wx'});}catch(error){if((error as NodeJS.ErrnoException).code==='EEXIST')throw Error('WORK_UNIT_ALREADY_STARTED');throw error;}
  return result;
}
