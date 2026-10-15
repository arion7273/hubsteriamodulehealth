import { API_BASE } from '../config.js';

export default function BackendBanner({ apiOnline }) {
  if (apiOnline === null) return null;
  if (apiOnline) return null;

  const onVercel =
    typeof window !== 'undefined' && /vercel\.app$/i.test(window.location.hostname);

  return (
    <div
      className="backend-banner"
      role="alert"
      style={{
        background: 'rgba(251, 191, 36, 0.12)',
        border: '1px solid rgba(251, 191, 36, 0.45)',
        borderRadius: 10,
        padding: '0.85rem 1rem',
        marginBottom: '1rem',
        fontSize: '0.9rem',
        lineHeight: 1.5,
      }}
    >
      <strong>Scan engine not connected.</strong>
      <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>
        Playwright runs on a <strong>Node server</strong>, not inside the static Vercel build.
      </p>
      <ol style={{ margin: '0.75rem 0 0', paddingLeft: '1.25rem', color: 'var(--muted)' }}>
        <li style={{ marginBottom: '0.5rem' }}>
          <strong>Easiest — one URL:</strong> Deploy this repo with the included{' '}
          <code>Dockerfile</code> (Railway, Render, or any VM). Open that host — UI and scans run together (
          <code>npm run start:prod</code> locally is the same stack).
        </li>
        {onVercel ? (
          <li style={{ marginBottom: '0.5rem' }}>
            <strong>Keep this Vercel UI:</strong> After the scanner is live, set Vercel env{' '}
            <code>SCANNER_API_ORIGIN</code> to that scanner URL (no trailing slash) and redeploy. The edge proxy
            forwards <code>/api</code> so scans work from this domain.
          </li>
        ) : (
          <li style={{ marginBottom: '0.5rem' }}>
            Or set <code>VITE_API_BASE</code> at build time to your scanner origin, or run{' '}
            <code>npm start</code> at <code>http://localhost:4177</code>.
          </li>
        )}
      </ol>
      {API_BASE ? (
        <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>
          Build-time API target <code>{API_BASE}</code> is unreachable.
        </p>
      ) : onVercel ? (
        <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>
          <code>SCANNER_API_ORIGIN</code> is not set (or the scanner is down). See{' '}
          <code>docs/DEPLOY.md</code> in the repo.
        </p>
      ) : null}
    </div>
  );
}
