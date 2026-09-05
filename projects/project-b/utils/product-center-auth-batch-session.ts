import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { removeAuthState } from './product-center-run-safety';

export type ProductCenterAuthBatchSession = {
  directory: string;
  authStatePath: string;
  env: (options?: { noDependencies?: boolean; requiredRoutes?: readonly string[] }) => NodeJS.ProcessEnv;
  cleanup: () => void;
};

export function createProductCenterAuthBatchSession(
  prefix = 'pc-auth-batch-',
): ProductCenterAuthBatchSession {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const authStatePath = path.join(directory, 'auth-state.json');
  let cleaned = false;

  return {
    directory,
    authStatePath,
    env: ({ noDependencies = false, requiredRoutes = [] } = {}) => ({
      ...process.env,
      MC_STORAGE_STATE_PATH: authStatePath,
      PC_PRESERVE_AUTH_STATE: '1',
      ...(requiredRoutes.length > 0 ? { PC_AUTH_REQUIRED_ROUTES: requiredRoutes.join(',') } : {}),
      ...(noDependencies ? { PC_AUTH_NO_DEPENDENCIES: '1' } : {}),
    }),
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      removeAuthState(authStatePath);
      fs.rmSync(directory, { recursive: true, force: true });
    },
  };
}
