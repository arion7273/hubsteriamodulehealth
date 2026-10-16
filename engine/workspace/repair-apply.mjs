import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { assertRepoPathSafe } from './repair-policy.mjs';

const BACKUP_DIR = path.join(process.cwd(), 'data', 'repair-backups');
const WORKTREE_ROOT = path.join(process.cwd(), 'data', 'repair-worktrees');

export function buildUnifiedDiff(relPath, before, after) {
  const bLines = before.split('\n');
  const aLines = after.split('\n');
  const header = `--- a/${relPath}\n+++ b/${relPath}\n`;
  if (before === after) return header + '(no changes)\n';
  return `${header}@@\n-${bLines.join('\n-')}\n+${aLines.join('\n+')}\n`;
}

/**
 * @param {string} repoRoot
 * @param {{ path: string, content: string }[]} files
 * @param {string} repairId
 */
export function applyPatchWithBackup(repoRoot, files, repairId) {
  const absRepo = path.resolve(repoRoot);
  const backupRoot = path.join(BACKUP_DIR, repairId);
  fs.mkdirSync(backupRoot, { recursive: true });
  const diffs = [];
  const applied = [];

  for (const file of files) {
    const rel = assertRepoPathSafe(absRepo, file.path);
    const target = path.join(absRepo, rel);
    const before = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : '';
    const after = file.content;
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const backupFile = path.join(backupRoot, rel);
    fs.mkdirSync(path.dirname(backupFile), { recursive: true });
    fs.writeFileSync(backupFile, before, 'utf8');
    fs.writeFileSync(target, after, 'utf8');
    diffs.push({ path: rel, unifiedDiff: buildUnifiedDiff(rel, before, after) });
    applied.push(rel);
  }

  return { backupRoot, diffs, applied };
}

export function restorePatchBackup(repairId, repoRoot) {
  const backupRoot = path.join(BACKUP_DIR, repairId);
  if (!fs.existsSync(backupRoot)) return { restored: false };
  const absRepo = path.resolve(repoRoot);
  const walk = (dir, prefix = '') => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = prefix ? `${prefix}/${name}` : name;
      if (fs.statSync(full).isDirectory()) walk(full, rel);
      else {
        const target = path.join(absRepo, rel);
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(full, target);
      }
    }
  };
  walk(backupRoot);
  return { restored: true, backupRoot };
}

export function createRepairWorktree(repoRoot, repairId, baseCommit) {
  const absRepo = path.resolve(repoRoot);
  const wtPath = path.join(WORKTREE_ROOT, repairId);
  if (fs.existsSync(wtPath)) {
    spawnSync('git', ['worktree', 'remove', '--force', wtPath], { cwd: absRepo });
  }
  fs.mkdirSync(WORKTREE_ROOT, { recursive: true });
  const branch = `module-health/repair-${repairId}`;
  const add = spawnSync('git', ['worktree', 'add', '-B', branch, wtPath, baseCommit ?? 'HEAD'], {
    cwd: absRepo,
    encoding: 'utf8',
  });
  if (add.status !== 0) {
    return { ok: false, error: add.stderr || add.stdout };
  }
  return { ok: true, worktreePath: wtPath, branch };
}

export function assertPatchNotStale(repoRoot, baseCommit) {
  if (!baseCommit) return { stale: false };
  const cur = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: path.resolve(repoRoot), encoding: 'utf8' });
  const head = cur.stdout?.trim();
  return { stale: head !== baseCommit, head, baseCommit };
}
