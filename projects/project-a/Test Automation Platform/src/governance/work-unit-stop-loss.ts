export type WorkUnitCostPolicy = {maxTokens:number;maxElapsedMs:number;maxAttempts:number};
export type WorkUnitObservation = {
  unitId:string;directionId:string;phase:'before-start'|'after-unit';
  tokenStart:number|null;tokenCurrent:number|null;elapsedMs:number;attempts:number;
  beforeQuestionIds:string[];afterQuestionIds:string[];
  priorEvidenceHashes:string[];
  evidence:Array<{sha256:string;kind:'runtime-receipt'|'formal-source'|'ui-observation'|'diagnosis'|'contract-proof'|'status-report';verified:boolean}>;
  policy:WorkUnitCostPolicy;
};

/** Advisory to the execution owner, enforced before launching the next work unit.
 * This does not pretend to interrupt provider billing or grant a business pass. */
export function evaluateWorkUnitStopLoss(input:WorkUnitObservation) {
  const reasons:string[]=[];
  const unique=(values:string[])=>new Set(values).size===values.length;
  if(!input.unitId||!input.directionId||!unique(input.beforeQuestionIds)||!unique(input.afterQuestionIds))reasons.push('WORK_UNIT_IDENTITY_INVALID');
  for(const value of [input.policy.maxTokens,input.policy.maxElapsedMs,input.policy.maxAttempts])if(!Number.isSafeInteger(value)||value<=0)reasons.push('WORK_UNIT_POLICY_INVALID');
  if(!Number.isFinite(input.elapsedMs)||input.elapsedMs<0||!Number.isSafeInteger(input.attempts)||input.attempts<0)reasons.push('WORK_UNIT_COST_INVALID');
  const tokensAvailable=input.tokenStart!==null&&input.tokenCurrent!==null;
  const tokensUsed=tokensAvailable?input.tokenCurrent!-input.tokenStart!:null;
  if(tokensAvailable&&(!Number.isSafeInteger(tokensUsed)||tokensUsed!<0))reasons.push('TOKEN_SAMPLE_INVALID');
  if(tokensUsed!==null&&tokensUsed>=input.policy.maxTokens)reasons.push('WORK_UNIT_TOKEN_LIMIT');
  if(input.elapsedMs>=input.policy.maxElapsedMs)reasons.push('WORK_UNIT_TIME_LIMIT');
  if(input.attempts>=input.policy.maxAttempts)reasons.push('WORK_UNIT_ATTEMPT_LIMIT');
  const newEvidence=[...new Set(input.evidence.filter(e=>e.verified&&e.kind!=='status-report'&&/^[a-f0-9]{64}$/i.test(e.sha256)&&!input.priorEvidenceHashes.includes(e.sha256)).map(e=>e.sha256))];
  const resolved=input.beforeQuestionIds.filter(id=>!input.afterQuestionIds.includes(id));
  const added=input.afterQuestionIds.filter(id=>!input.beforeQuestionIds.includes(id));
  const scopeReduced=resolved.length>added.length;
  if(input.phase==='after-unit') {
    if(!newEvidence.length)reasons.push('NO_NEW_VERIFIED_EVIDENCE');
    if(!scopeReduced)reasons.push('UNRESOLVED_SCOPE_NOT_REDUCED');
  }
  return {schemaVersion:'1.0.0',unitId:input.unitId,directionId:input.directionId,decision:reasons.length?'pause-direction':'continue',reasons:[...new Set(reasons)],tokensUsed,tokenMeasurementStatus:tokensAvailable?'available':'unavailable',resolvedQuestionIds:resolved,newQuestionIds:added,newEvidenceHashes:newEvidence,scopeReduced,businessPassAuthorized:false,otherIndependentDirectionsMayContinue:true};
}
