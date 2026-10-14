import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';

function FindingRow({ f, runId, expanded, setExpanded, onRetest }) {
  async function copyPrompt() {
    const text = await api(`/api/findings/${runId}/${f.id}/cursor-prompt`);
    await navigator.clipboard.writeText(text);
    alert('Cursor fix prompt copied.');
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 0' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`badge ${f.status === 'pass' ? 'pass' : f.status === 'fail' ? 'fail' : 'blocked'}`}>
          {f.status}
        </span>
        <strong>{f.title}</strong>
        {f.trend && <span style={{ color: 'var(--muted)' }}>({f.trend})</span>}
      </div>
      {f.expected && <p style={{ fontSize: '0.85rem' }}>Expected: {f.expected}</p>}
      {f.actual && <p style={{ fontSize: '0.85rem' }}>Actual: {f.actual}</p>}
      {f.suspectedCause && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Suspected: {f.suspectedCause}</p>}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
        <button type="button" onClick={() => setExpanded(expanded === f.id ? null : f.id)}>
          {expanded === f.id ? 'Hide evidence' : 'Show evidence'}
        </button>
        {f.status === 'fail' && (
          <>
            <button type="button" onClick={copyPrompt}>Copy Cursor fix prompt</button>
            <button type="button" onClick={() => onRetest(f.checkId)}>Retest this finding</button>
          </>
        )}
      </div>
      {expanded === f.id && (
        <pre style={{ fontSize: '0.75rem', overflow: 'auto', background: '#121a26', padding: '0.75rem' }}>
          {JSON.stringify(f, null, 2)}
        </pre>
      )}
    </div>
  );
}

export default function ReportDetail() {
  const { runId } = useParams();
  const [report, setReport] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const [showPassing, setShowPassing] = useState(false);

  useEffect(() => {
    api(`/api/runs/${runId}`).then(setReport);
  }, [runId]);

  if (!report) return <p>Loading…</p>;

  const counts = report.summary?.counts ?? {};
  const structured = report.structured?.sections ?? {};

  async function retestFinding(checkId) {
    const { runId: newId } = await api(`/api/runs/${runId}/retest`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'finding', checkId }),
    });
    window.location.href = `/reports/${newId}`;
  }

  async function retestFailed() {
    const { runId: newId } = await api(`/api/runs/${runId}/retest`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'failed' }),
    });
    window.location.href = `/reports/${newId}`;
  }

  return (
    <div className="stack">
      <h2>{report.appName} — report</h2>
      <div className="card">
        <p>{report.headline}</p>
        <p style={{ color: 'var(--muted)' }}>{report.comparisonNote}</p>
        <p>
          Environment: {report.environment} · Input: {report.inputMode ?? 'url'} · URL:{' '}
          {report.meta?.targetUrl ?? '—'} · Duration:{' '}
          {report.meta?.durationMs ? `${report.meta.durationMs}ms` : '—'}
        </p>
        {(report.packsExecuted?.length ?? 0) > 0 && (
          <p>Packs: {report.packsExecuted.join(', ')}</p>
        )}
        {(report.tools?.length ?? 0) > 0 && (
          <div style={{ marginTop: '0.75rem' }}>
            <h4 style={{ margin: '0 0 0.35rem' }}>Tools executed</h4>
            <ul style={{ margin: 0, paddingLeft: '1.25rem' }}>
              {report.tools.map((t) => (
                <li key={`${t.tool}-${t.pack}`}>
                  {t.tool} {t.version ? `(${t.version})` : ''} · pack {t.pack} · {t.status}
                  {t.reason ? ` — ${t.reason}` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}
        <p>
          Pass {counts.pass ?? 0} · Fail {counts.fail ?? 0} · Blocked {counts.blocked ?? 0} · Not tested{' '}
          {counts.not_tested ?? 0} · N/A {counts.not_applicable ?? 0}
        </p>
        {report.meta?.previousRunId && (
          <p>
            Compared to: <Link to={`/reports/${report.meta.previousRunId}`}>{report.meta.previousRunId}</Link>
          </p>
        )}
        <button type="button" className="primary" onClick={retestFailed}>Rerun failed checks</button>
      </div>

      <div className="card">
        <h3>Verified defects</h3>
        {(structured.defects ?? []).length === 0 ? <p>None</p> : (
          structured.defects.map((f) => (
            <FindingRow key={f.id} f={f} runId={runId} expanded={expanded} setExpanded={setExpanded} onRetest={retestFinding} />
          ))
        )}
      </div>

      <div className="card">
        <h3>Warnings & review</h3>
        {(structured.warnings ?? []).map((f) => (
          <FindingRow key={f.id} f={f} runId={runId} expanded={expanded} setExpanded={setExpanded} onRetest={retestFinding} />
        ))}
      </div>

      <div className="card">
        <h3>Blocked / not tested</h3>
        {[...(structured.blocked ?? []), ...(structured.not_tested ?? [])].map((f) => (
          <FindingRow key={f.id} f={f} runId={runId} expanded={expanded} setExpanded={setExpanded} onRetest={retestFinding} />
        ))}
      </div>

      <div className="card">
        <button type="button" onClick={() => setShowPassing(!showPassing)}>
          {showPassing ? 'Hide' : 'Show'} successful checks ({(structured.passing ?? []).length})
        </button>
        {showPassing && (structured.passing ?? []).map((f) => (
          <FindingRow key={f.id} f={f} runId={runId} expanded={expanded} setExpanded={setExpanded} onRetest={retestFinding} />
        ))}
      </div>
    </div>
  );
}
