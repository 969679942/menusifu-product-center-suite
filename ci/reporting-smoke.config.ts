import {defineConfig} from '../projects/project-a/Merchant Center UITest/node_modules/@playwright/test';
import path from 'node:path';
process.env.ALLURE_RESULTS_DIR=path.resolve(__dirname,'../output/ci/allure-results');
export default defineConfig({testDir:__dirname,testMatch:'reporting-smoke.spec.ts',workers:1,
  outputDir:path.resolve(__dirname,'../output/ci/report-smoke-artifacts'),
  reporter:[['line'],[path.resolve(__dirname,'../projects/project-a/Merchant Center UITest/reporters/product-center-system-allure.reporter.ts')]]});
