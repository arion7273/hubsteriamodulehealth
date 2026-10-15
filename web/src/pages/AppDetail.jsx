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
          <Link to={`/run?app=${app.id}&packs=quick-health,ui-a11y`}>URL smoke + UI/a11y packs →</Link>
          {' · '}
          <Link to={`/run?app=${app.id}&inputMode=repository&packs=code-quality,security`}>
            Repository code + security packs →
          </Link>
        </p>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Level 1 URL-only runs do not replace repository tests or module route walks. Use both when building features.
        </p>
    </div>
  );
}
