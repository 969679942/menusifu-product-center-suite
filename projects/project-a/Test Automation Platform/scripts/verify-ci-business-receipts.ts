import fs from 'node:fs';
import { evaluateSystemTestRuntimeContract } from '../src/automation/system-test/system-test-runtime-contract';

export function verifyCiBusinessReceipts(ledger: any, contract: any) {
  const required=contract?.cases??[];
  const actual=ledger?.cases??[];
  const cases=required.map((expected:any)=>{
    const matches=actual.filter((item:any)=>item.caseId===expected.caseId);
    if(matches.length!==1)return {caseId:expected.caseId,status:'incomplete',reason:'missing-or-duplicate-case'};
    const record=matches[0],operations=expected.requiredOperationKeys??[];
    return {caseId:expected.caseId,...evaluateSystemTestRuntimeContract({
      caseId:expected.caseId,requiredOperationKeys:operations,
      requiredAssertionIds:(expected.expectationClaims??[]).map((claim:any)=>claim.claimId),
      operationReceipts:(record.runtimeEvidence?.operationReceipts??[]).filter((item:any)=>operations.includes(item.operationKey)),
      assertionReceipts:record.runtimeEvidence?.assertionReceipts??[],
    })};
  });
  const complete=required.length>0 && actual.length===required.length && cases.every((item:any)=>item.status==='complete');
  return {status:complete?'complete':'incomplete',selected:required.length,received:actual.length,cases};
}
if(require.main===module){
  const args=Object.fromEntries(process.argv.slice(2).map(arg=>arg.split('=',2)));
  const result=verifyCiBusinessReceipts(JSON.parse(fs.readFileSync(args['--ledger'],'utf8')),JSON.parse(fs.readFileSync(args['--contract'],'utf8')));
  process.stdout.write(JSON.stringify(result));
  process.exitCode=result.status==='complete'?0:2;
}
