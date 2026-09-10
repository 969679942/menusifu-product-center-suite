import { resolveContractRunIsolation } from '../../../Test Automation Platform/src/utils/contract-run-isolation';

export function resolveMerchantCenterContractRunIsolation() {
  return resolveContractRunIsolation({
    argv: process.argv.slice(2),
    contractProjectNames: ['api'],
    isolationRequested: process.env.PC_CONTRACT_ISOLATED === '1',
  });
}
