import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { createHash } from 'node:crypto';

declare const leaseIdentity: unique symbol;
export type SystemTestRunLease = { readonly [leaseIdentity]: true };
const leases = new WeakMap<SystemTestRunLease, { scope: string; active: boolean; childActive: boolean }>();

/** Process-owned local IPC endpoint: the OS releases ownership even after a hard process exit. */
export async function withSystemTestRunLease<T>(input: {
  projectRoot: string; systemId: string; runId: string; parentLease?: SystemTestRunLease;
}, action: (lease: SystemTestRunLease) => Promise<T>): Promise<T> {
  for (const value of [input.systemId, input.runId]) {
    if (!/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(value)) throw new Error('SYSTEM_TEST_RUN_PATH_ID_INVALID');
  }
  if (!path.isAbsolute(input.projectRoot)) throw new Error('SYSTEM_TEST_RUN_ROOT_INVALID');
  const realRoot = fs.realpathSync(input.projectRoot);
  const scope = JSON.stringify([process.platform === 'win32' ? realRoot.toLowerCase() : realRoot,
    process.platform === 'win32' ? input.systemId.toLowerCase() : input.systemId]);
  if (input.parentLease) {
    const parent = leases.get(input.parentLease);
    if (!parent?.active || parent.scope !== scope) throw new Error('SYSTEM_TEST_RUN_PARENT_LEASE_INVALID');
    if (parent.childActive) throw new Error('SYSTEM_TEST_RUN_ALREADY_ACTIVE');
    parent.childActive = true;
    try { return await action(input.parentLease); } finally { parent.childActive = false; }
  }
  const key = createHash('sha256').update(scope).digest('hex');
  const endpoint = process.platform === 'win32' ? `\\\\.\\pipe\\tap-run-${key}`
    : process.platform === 'linux' ? `\0tap-run-${key}` : null;
  if (!endpoint) throw new Error('SYSTEM_TEST_RUN_LEASE_PLATFORM_UNSUPPORTED');
  const server = net.createServer((socket) => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    server.once('error', (error: NodeJS.ErrnoException) => reject(new Error(
      error.code === 'EADDRINUSE' ? 'SYSTEM_TEST_RUN_ALREADY_ACTIVE' : 'SYSTEM_TEST_RUN_LEASE_UNAVAILABLE',
    )));
    server.listen(endpoint, resolve);
  });
  const lease = {} as SystemTestRunLease;
  const state = { scope, active: true, childActive: false };
  leases.set(lease, state);
  try { return await action(lease); }
  finally { state.active = false; await new Promise<void>((resolve) => server.close(() => resolve())); }
}
