import { apiBase } from '../config.js';

function fileUrl(ref) {
  if (!ref) return null;
  const path = typeof ref === 'string' ? ref : ref.path;
  if (!path) return null;
  const base = apiBase() || '';
  return `${base}/api/files?path=${encodeURIComponent(path)}`;
}

export default function EvidencePreview({ evidence = [] }) {
  if (!evidence?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginTop: '0.5rem' }}>
      {evidence.map((ev, i) => {
        const url = fileUrl(ev);
        const type = ev.type ?? 'file';
        if (type === 'screenshot' || type === 'screenshot-diff' || type === 'baseline') {
          return (
            <figure key={i}>
              <img src={url} alt={type} style={{ maxWidth: '100%', border: '1px solid var(--border)' }} />
              <figcaption style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{type}</figcaption>
            </figure>
          );
        }
        if (type === 'lighthouse-json' || type === 'playwright-trace' || type === 'jest-json') {
          return (
            <a key={i} href={url} target="_blank" rel="noreferrer">
              Download {type}
            </a>
          );
        }
        return (
          <a key={i} href={url} target="_blank" rel="noreferrer">
            View evidence ({type})
          </a>
        );
      })}
    </div>
  );
}
