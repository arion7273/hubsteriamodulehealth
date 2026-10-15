import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api } from '../api.js';

export default function AppDetail() {
  const { appId } = useParams();
  const [app, setApp] = useState(null);

  useEffect(() => {
    api('/api/registry').then((reg) => setApp(reg.apps.find((a) => a.id === appId)));
  }, [appId]);

  if (!app) return <p>Loading…</p>;

  return (
    <div>
      <h2>{app.name}</h2>
      <p>{app.description}</p>
      <div className="card">
        <h3>Module inventory</h3>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th align="left">Module</th>
              <th align="left">Status</th>
              <th align="left">Routes</th>
            </tr>
          </thead>
          <tbody>
            {(app.modules ?? []).map((m) => (
              <tr key={m.id}>
                <td>{m.label}</td>
                <td>{m.status}</td>
                <td>{(m.routes ?? []).join(', ')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Status meanings: present / expected / disabled — not every discovered UI element is a requirement.
        </p>
      </div>
        <p style={{ marginTop: '1rem' }}>
          <Link
            className="primary"
            style={{ display: 'inline-block', padding: '0.5rem 0.75rem', borderRadius: 8, textDecoration: 'none' }}
            to={`/run?app=${app.id}&preset=comprehensive-build-url`}
          >
            Comprehensive build verification (URL) →
          </Link>
        </p>
        <p style={{ marginTop: '0.5rem' }}>
          <Link to={`/run?app=${app.id}&preset=comprehensive-build-repo`}>
            Comprehensive build verification (repository) →
          </Link>
          {' · '}
          <Link to={`/run?app=${app.id}&packs=quick-health`}>Quick URL smoke only →</Link>
        </p>
        <p style={{ marginTop: '0.75rem' }}>
          <button
            type="button"
            onClick={async () => {
              const text = await api(`/api/apps/${app.id}/comprehensive-audit-prompt`, {
                method: 'POST',
                body: JSON.stringify({
                  environment: app.environments?.[0]?.id ?? 'production',
                  uiOrigin: window.location.origin,
                  moduleHealthApiBase: window.location.origin,
                }),
              });
              await navigator.clipboard.writeText(text);
              alert('Comprehensive audit prompt copied — paste into the target app repo in Cursor.');
            }}
          >
            Copy Cursor comprehensive audit prompt
          </button>
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          URL preset does not run repository security or unit tests — run both URL and repository presets before release.
          See <code>docs/CURSOR_COMPREHENSIVE_AUDIT_PROMPT.md</code>.
        </p>
    </div>
  );
}
