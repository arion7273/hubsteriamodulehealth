import { apiUrl } from '../config.js';

export function downloadTextFile(filename, text, mime = 'text/markdown;charset=utf-8') {
  saveBlob(filename, new Blob([text], { type: mime }));
}

function saveBlob(filename, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/**
 * @param {string} path - API path (e.g. /api/runs/.../audit.md)
 * @param {string} filename
 * @param {{ fallbackText?: string, fallbackJson?: object }} [opts]
 */
export async function downloadFromApi(path, filename, opts = {}) {
  let status = 0;
  try {
    const res = await fetch(apiUrl(path));
    status = res.status;
    if (res.ok) {
      saveBlob(filename, await res.blob());
      return true;
    }
  } catch {
    /* network */
  }

  if (opts.fallbackText != null) {
    saveBlob(filename, new Blob([opts.fallbackText], { type: 'text/markdown;charset=utf-8' }));
    return true;
  }
  if (opts.fallbackJson != null) {
    saveBlob(filename, new Blob([JSON.stringify(opts.fallbackJson, null, 2)], { type: 'application/json' }));
    return true;
  }

  const hint =
    status === 404
      ? 'Download API returned 404 — restart Module Health (npm start) so export routes load, or use the in-page fallback after refresh.'
      : `Download failed (HTTP ${status || 'network'}).`;
  window.alert(hint);
  return false;
}
