import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Reports() {
  const [runs, setRuns] = useState([]);

  useEffect(() => {
    api('/api/runs').then((d) => setRuns(d.runs ?? []));
  }, []);

  return (
    <div>
      <h2>Daily & on-demand reports</h2>
      <div className="card">
        {runs.length === 0 ? <p>No reports yet. Run a test from the Run test screen.</p> : (
          <table style={{ width: '100%' }}>
            <thead>
              <tr>
                <th align="left">When</th>
                <th align="left">App</th>
                <th align="left">Env</th>
                <th align="left">Gate</th>
                <th align="left">Headline</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.runId}>
                  <td>{new Date(r.generatedAt).toLocaleString()}</td>
                  <td><Link to={`/reports/${r.runId}`}>{r.appName}</Link></td>
                  <td>{r.environment}</td>
                  <td><span className={`badge ${r.gate === 'ship' ? 'pass' : 'fail'}`}>{r.gate}</span></td>
                  <td style={{ fontSize: '0.85rem' }}>{r.headline}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
