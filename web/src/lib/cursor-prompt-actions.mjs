import { api } from '../api.js';
import { downloadFromApi, downloadTextFile } from './download-export.mjs';

/**
 * @param {string} runId
 * @param {{ findingIds?: string[], label?: string }} opts
 */
export async function fetchRepairPrompt(runId, opts = {}) {
  return api(`/api/runs/${runId}/repair-prompt`, {
    method: 'POST',
    body: JSON.stringify({
      findingIds: opts.findingIds,
      label: opts.label,
    }),
  });
}

/**
 * @param {string} runId
 * @param {string} filename
 * @param {{ findingIds?: string[], label?: string }} opts
 */
export async function downloadRepairPrompt(runId, filename, opts = {}) {
  const params = new URLSearchParams();
  if (opts.findingIds?.length) params.set('findingIds', opts.findingIds.join(','));
  if (opts.label) params.set('label', opts.label);
  const qs = params.toString();
  let fallbackText;
  try {
    fallbackText = await fetchRepairPrompt(runId, opts);
  } catch {
    /* use GET only */
  }
  await downloadFromApi(`/api/runs/${runId}/repair-prompt.md${qs ? `?${qs}` : ''}`, filename, {
    fallbackText,
  });
}

export async function copyAndDownloadText(text, filename) {
  await navigator.clipboard.writeText(text);
  downloadTextFile(filename, text);
}
