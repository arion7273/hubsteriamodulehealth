import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Overview() {
  const [registry, setRegistry] = useState(null);
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    api('/api/registry').then(setRegistry);
    api('/api/runs').then((d) => setRuns(d.runs?.slice(0, 5) ?? []));
  }, []);

  return (
    <div>
      <h2>Multi-app overview</h2>
      <p style={{ color: 'var(--muted)' }}>
        Run focused checks per app, module, workflow, or level. Partial coverage is reported honestly.
      </p>
      <div className="grid">
        {(registry?.apps ?? []).map((app) => (
          <div className="card" key={app.id}>
            <h3>{app.name}</h3>
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{app.description}</p>
            <p>
              Modules: {(app.modules ?? []).length} configured · Schedules:{' '}
              {app.schedules?.enabled ? 'on' : 'off'}
            </p>
            <Link to={`/apps/${app.id}`}>App detail →</Link>
          </div>
        ))}
      </div>
      <div className="card">
        <h3>Recent runs</h3>
        {runs.length === 0 ? <p>No runs yet.</p> : (
          <ul>
            {runs.map((r) => (
              <li key={r.runId}>
                <Link to={`/reports/${r.runId}`}>{r.appName ?? r.appId}</Link> — {r.gate} — {r.generatedAt}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
