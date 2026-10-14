import { spawn } from 'node:child_process';

/**
 * Run command without shell interpolation (untrusted paths only from config).
 * @param {string} cmd
 * @param {string[]} args
 * @param {object} opts
 */
export function runCommand(cmd, args, opts = {}) {
  const { cwd, timeoutMs = 120_000, env } = opts;
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: { ...process.env, ...env, CI: 'true' },
      shell: false,
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd}`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    child.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
  });
}

export async function commandExists(cmd, args = ['--version']) {
  try {
    const r = await runCommand(cmd, args, { timeoutMs: 8000 });
    return r.code === 0;
  } catch {
    return false;
  }
}
