import {test,expect} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';
import {resolvePlaywrightExecutionTerminalCaseIds} from '../../../Test Automation Platform/src/governance/execution-terminal-receipts';
import {createMerchantCenterAllurePlaywrightV3Options} from '../../adapters/test-automation-platform/allure-reporting';

test('备用商品入口实际配置独立报告且失败后恢复环境与撤销执行授权',async()=>{
  const source=fs.readFileSync(path.join(process.cwd(),'scripts/run-product-center-optimization-batches.ts'),'utf8');
  const parsed=ts.createSourceFile('runner.ts',source,ts.ScriptTarget.Latest,true);
  const node=parsed.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text==='runHandledItems')!;
  expect(node).toBeDefined();
  const env:any={PC_ITEM_RUN_ID:'prior',PC_SOURCE_GOVERNED_ALLURE_DIR:'prior-allure',ALLURE_RESULTS_DIR:'prior-real-allure'};
  let revoked=false,observed:any;
  const context:any={process:{env},path,projectRoot:process.cwd(),plan:{fingerprint:'current-plan'},
    fingerprintSystemTestValue:()=> 'candidate',unitRunId:(unit:string)=>'synthetic-'+unit,
    issueSystemTestExecutionGrant:()=>({env:{GRANT:'redacted-test'}}),revokeSystemTestExecutionGrant:()=>{revoked=true;},
    captureEnv:(keys:string[])=>Object.fromEntries(keys.map(key=>[key,env[key]])),
    restoreEnv:(prior:Record<string,unknown>)=>{for(const [key,value]of Object.entries(prior))if(value===undefined)delete env[key];else env[key]=value;},
    runProductCenterItem213:(options:unknown)=>{observed={options,env:{...env}};throw Error('synthetic-run-interruption');}};
  vm.runInNewContext(ts.transpile(node.getText(parsed)+'\nglobalThis.run = runHandledItems;',{target:ts.ScriptTarget.ES2022}),context);
  let failure='';
  try { await context.run(['case-a']); } catch (error) { failure=String(error); }
  expect(failure).toContain('synthetic-run-interruption');
  expect(observed.options).toEqual({caseIds:['case-a'],workerCount:1,shardCount:1});
  expect(observed.env.PC_SOURCE_GOVERNED_ALLURE_DIR).toContain('synthetic-handled-item-revalidation');
  const previousAllure=process.env.ALLURE_RESULTS_DIR;
  try {
    process.env.ALLURE_RESULTS_DIR=observed.env.ALLURE_RESULTS_DIR;
    expect(createMerchantCenterAllurePlaywrightV3Options().resultsDir).toBe(observed.env.PC_SOURCE_GOVERNED_ALLURE_DIR);
  } finally {
    if(previousAllure===undefined)delete process.env.ALLURE_RESULTS_DIR;else process.env.ALLURE_RESULTS_DIR=previousAllure;
  }
  expect(observed.env.PC_PLAYWRIGHT_OUTPUT_DIR).toContain('synthetic-handled-item-revalidation');
  expect(observed.env.PLAYWRIGHT_JSON_OUTPUT_NAME).toContain('synthetic-handled-item-revalidation.json');
  expect(env).toEqual({PC_ITEM_RUN_ID:'prior',PC_SOURCE_GOVERNED_ALLURE_DIR:'prior-allure',ALLURE_RESULTS_DIR:'prior-real-allure'});expect(revoked).toBe(true);
});
test('公共终态合同接受真实失败，跳过与缺失报告不冒充执行完成',()=>{
  const manifest={authSetupStatus:'passed',selectedCaseIds:['a','b'],reportPaths:['result.json'],runnerReports:[{reportPath:'result.json',selectedCaseIds:['a','b']}]};
  const readReport=()=>({suites:[{specs:[{tests:[{annotations:[{type:'canonical-case-id',description:'a'}],results:[{status:'failed'}]},
    {annotations:[{type:'canonical-case-id',description:'b'}],results:[{status:'skipped'}]}]}]}]});
  expect(resolvePlaywrightExecutionTerminalCaseIds({selectedCaseIds:['a','b'],manifest,readReport})).toEqual(['a']);
  expect(resolvePlaywrightExecutionTerminalCaseIds({selectedCaseIds:['a','b'],manifest,readReport:()=>null})).toEqual([]);
});
