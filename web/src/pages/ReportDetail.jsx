import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api.js';

export default function ReportDetail() {
  const { runId } = useParams();
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    api(`/api/runs/${runId}`).then(setReport);
  }, [runId]);

  if (!report) return <p>Loading…</p>;

  const counts = report.summary?.counts ?? {};

  async function copyPrompt(findingId) {
    const text = await api(`/api/findings/${runId}/${findingId}/cursor-prompt`);
    await navigator.clipboard.writeText(text);
    alert('Cursor fix prompt copied to clipboard.');
  }

  return (
    <div className="stack">
      <h2>{report.appName} — report</h2>
      <div className="card">
        <p>{report.headline}</p>
        <p style={{ color: 'var(--muted)' }}>{report.comparisonNote}</p>
        <p>
          Environment: {report.environment} · Levels: {(report.levels ?? []).join(', ')} ·{' '}
          {report.generatedAt}
        </p>
        <p>
          Pass {counts.pass ?? 0} · Fail {counts.fail ?? 0} · Blocked {counts.blocked ?? 0} · Not tested{' '}
          {counts.not_tested ?? 0}
        </p>
      </div>

      <div className="card">
        <h3>Recommendations</h3>
        {(report.recommendations ?? []).length === 0 ? <p>No failures.</p> : (
          <ol>
            {report.recommendations.map((r) => (
              <li key={r.findingId}>{r.title} — {r.summary}</li>
            ))}
          </ol>
        )}
      </div>

      <div className="card">
        <h3>Findings</h3>
        {report.findings.map((f) => (
          <div key={f.id} style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 0' }}>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <span className={`badge ${f.status === 'pass' ? 'pass' : f.status === 'fail' ? 'fail' : 'blocked'}`}>
                {f.status}
              </span>
              <strong>{f.title}</strong>
              {f.trend && <span style={{ color: 'var(--muted)' }}>({f.trend})</span>}
            </div>
            {f.actual && <p style={{ fontSize: '0.9rem' }}>Actual: {f.actual}</p>}
            <button type="button" onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
              {expanded === f.id ? 'Hide evidence' : 'Show evidence'}
            </button>
            {f.status === 'fail' && (
              <button type="button" style={{ marginLeft: '0.5rem' }} onClick={() => copyPrompt(f.id)}>
                Copy Cursor fix prompt
              </button>
            )}
            {expanded === f.id && (
              <pre style={{ fontSize: '0.75rem', overflow: 'auto', background: '#121a26', padding: '0.75rem' }}>
                {JSON.stringify(f, null, 2)}
              </pre>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
