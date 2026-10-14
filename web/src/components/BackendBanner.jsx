import { API_BASE } from '../config.js';

export default function BackendBanner({ apiOnline }) {
  if (apiOnline === null) return null;
  if (apiOnline) return null;

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
      <strong>Tests cannot run from this host alone.</strong>
      <p style={{ margin: '0.5rem 0 0', color: 'var(--muted)' }}>
        This Vercel deployment is the <em>UI only</em>. Scans need the Node server with Playwright (
        <code>npm start</code> on a VM, Railway, Fly.io, etc.). Set{' '}
        <code>VITE_API_BASE</code> to that server URL and redeploy, or run everything locally at{' '}
        <code>http://localhost:4177</code>.
        {API_BASE ? (
          <>
            {' '}
            Current API target: <code>{API_BASE}</code> (unreachable).
          </>
        ) : (
          <> No <code>VITE_API_BASE</code> is configured.</>
        )}
      </p>
    </div>
  );
}
