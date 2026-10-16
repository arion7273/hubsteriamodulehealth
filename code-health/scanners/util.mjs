import { spawn } from 'node:child_process';

/**
 * @param {string} cmd
 * @param {string[]} args
 * @param {{ cwd?: string, env?: Record<string, string>, timeoutMs?: number }} [opts]
 */
export function runCommand(cmd, args, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 300_000;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...opts.env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr?.on('data', (d) => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd} ${args.join(' ')}`));
    }, timeoutMs);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, stdout, stderr });
    });
    child.on('error', reject);
  });
}

/**
 * @param {string} scannerId
 * @param {string} name
 * @param {import('../core/types.mjs').ScannerRunStatus} status
 * @param {Partial<import('../core/types.mjs').ScannerRunResult>} rest
 */
export function scannerResult(scannerId, name, status, rest = {}) {
  return {
    id: scannerId,
    name,
    status,
    durationMs: rest.durationMs ?? 0,
    version: rest.version,
    error: rest.error,
    skipReason: rest.skipReason,
    findings: rest.findings ?? [],
    raw: rest.raw,
  };
}
