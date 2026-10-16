import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '../data');
const AI_CACHE_DIR = path.join(DATA_DIR, 'ai-cache');

function ensureAiCacheDir() {
  fs.mkdirSync(AI_CACHE_DIR, { recursive: true });
}

function aiCachePath(runId) {
  return path.join(AI_CACHE_DIR, `${runId}.json`);
}

export function loadAiCache(runId) {
  ensureAiCacheDir();
  const file = aiCachePath(runId);
  if (!fs.existsSync(file)) return null;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

export function saveAiCache(runId, entry) {
  ensureAiCacheDir();
  fs.writeFileSync(aiCachePath(runId), JSON.stringify(entry, null, 2) + '\n', 'utf8');
}
