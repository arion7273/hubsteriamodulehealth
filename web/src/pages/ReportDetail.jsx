import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import EvidencePreview from '../components/EvidencePreview.jsx';
import { prerequisiteLabel } from '../lib/report-ui.mjs';

function formatMeta(value, unavailable) {
  if (value != null && value !== '') return String(value);
  return unavailable ?? '—';
}

function FindingRow({ f, runId, expanded, setExpanded, onRetest }) {
  async function copyPrompt() {
    const text = await api(`/api/findings/${runId}/${f.id}/cursor-prompt`);
    await navigator.clipboard.writeText(text);
    alert('Cursor fix prompt copied.');
  }

  const prereq = prerequisiteLabel(f);

  return (
    <div style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 0' }}>
      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span className={`badge ${f.status === 'pass' ? 'pass' : f.status === 'fail' ? 'fail' : 'blocked'}`}>
          {f.status}
        </span>
        <strong>{f.title}</strong>
        {f.checkId && <code style={{ fontSize: '0.75rem', color: 'var(--muted)' }}>{f.checkId}</code>}
        {f.trend && <span style={{ color: 'var(--muted)' }}>({f.trend})</span>}
        {f.preservedFromRun && <span style={{ color: 'var(--muted)' }}>preserved from prior run</span>}
      </div>
      {f.expected && <p style={{ fontSize: '0.85rem' }}>Expected: {f.expected}</p>}
      {f.actual && <p style={{ fontSize: '0.85rem' }}>Actual: {f.actual}</p>}
      {prereq && (f.status === 'blocked' || f.status === 'not_tested') && (
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{prereq}</p>
      )}
      {f.suspectedCause && <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>Suspected: {f.suspectedCause}</p>}
      {f.remediation?.summary && (
        <p style={{ fontSize: '0.85rem' }}>Remediation: {f.remediation.summary}</p>
      )}
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
        <>
          <EvidencePreview evidence={f.evidence} />
          <pre style={{ fontSize: '0.75rem', overflow: 'auto', background: '#121a26', padding: '0.75rem' }}>
            {JSON.stringify(f, null, 2)}
          </pre>
        </>
      )}
    </div>
  );
}

function Section({ title, emptyLabel, items, runId, expanded, setExpanded, onRetest }) {
  return (
    <div className="card">
      <h3>{title} ({items.length})</h3>
      {items.length === 0 ? <p>{emptyLabel}</p> : (
        items.map((f) => (
          <FindingRow
            key={f.id}
            f={f}
            runId={runId}
            expanded={expanded}
            setExpanded={setExpanded}
            onRetest={onRetest}
          />
        ))
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
  const exec = report.summary?.execution ?? {};
  const sections = report.structured?.sections ?? {};
  const unavailable = report.meta?.unavailable ?? {};

  const appDefects = sections.app_defects ?? sections.defects ?? [];
  const runnerFailures = sections.runner_failures ?? [];
  const review = sections.review ?? sections.warnings ?? [];
  const blocked = sections.blocked ?? [];
  const notExecuted = sections.not_executed ?? sections.not_tested ?? [];
  const passing = sections.passing ?? [];

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
        <p><strong>Gate:</strong> {report.gate}</p>
        <p>{report.headline}</p>
        <p style={{ color: 'var(--muted)' }}>{report.comparisonNote}</p>
        <p>{report.summary?.moduleCoverageNote}</p>
        <p>
          Environment: {report.environment} · Input: {report.inputMode ?? 'url'} · Levels:{' '}
          {(report.levels ?? []).join(', ')}
        </p>
        <p>
          Target URL: {formatMeta(report.meta?.targetUrl, unavailable.targetUrl)} · Final URL:{' '}
          {formatMeta(report.meta?.finalUrl, unavailable.finalUrl)}
        </p>
        <p>
          Started: {formatMeta(report.meta?.startedAt, unavailable.startedAt)} · Ended:{' '}
          {formatMeta(report.meta?.endedAt, unavailable.endedAt)} · Duration:{' '}
          {report.meta?.durationMs != null
            ? `${report.meta.durationMs}ms`
            : formatMeta(null, unavailable.durationMs)}
        </p>
        {(report.packsExecuted?.length ?? 0) > 0 && (
          <p>Packs: {report.packsExecuted.join(', ')}</p>
        )}
        <p>
          <strong>Execution:</strong> {exec.planned ?? counts.planned ?? '—'} planned ·{' '}
          {exec.completed ?? counts.pass + counts.fail} completed · {exec.blocked ?? counts.blocked ?? 0} blocked ·{' '}
          {exec.notExecuted ?? '—'} not executed · {exec.notApplicable ?? counts.not_applicable ?? 0} N/A
        </p>
        <p>
          Outcomes (completed only): Pass {counts.pass ?? 0} · Fail {counts.fail ?? 0}
        </p>
        {report.consistency && !report.consistency.ok && (
          <p style={{ color: 'var(--warn, orange)' }}>
            Report consistency: {report.consistency.issues.join('; ')}
          </p>
        )}
        {report.meta?.previousRunId && (
          <p>
            Compared to: <Link to={`/reports/${report.meta.previousRunId}`}>{report.meta.previousRunId}</Link>
          </p>
        )}
        {report.meta?.retestOf && (
          <p>
            Retest of: <Link to={`/reports/${report.meta.retestOf}`}>{report.meta.retestOf}</Link>
            {report.meta.retestMode ? ` (${report.meta.retestMode})` : ''}
          </p>
        )}
        <button type="button" className="primary" onClick={retestFailed}>Rerun failed checks</button>
      </div>

      {report.coverage && (
        <div className="card" style={{ borderColor: report.coverage.isBuildAdequate ? undefined : 'rgba(251, 191, 36, 0.5)' }}>
          <h3>Build coverage — {report.coverage.profileLabel}</h3>
          {report.coverage.honestyNote && (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{report.coverage.honestyNote}</p>
          )}
          <p style={{ fontSize: '0.85rem' }}>
            Input <strong>{report.coverage.inputMode}</strong>
            {report.coverage.packs?.length ? ` · Packs: ${report.coverage.packs.join(', ')}` : ''}
            {report.coverage.levels?.length ? ` · Levels: ${report.coverage.levels.join(', ')}` : ''}
          </p>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse', marginTop: '0.75rem' }}>
            <thead>
              <tr>
                <th align="left">Category</th>
                <th align="left">This run</th>
                <th align="left">If not run</th>
              </tr>
            </thead>
            <tbody>
              {report.coverage.categories?.map((c) => (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{c.label}</td>
                  <td>{c.status === 'executed' ? '✓ Executed' : '— Not run'}</td>
                  <td style={{ color: 'var(--muted)' }}>{c.reason ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(report.coverage.modules?.length ?? 0) > 0 && (
            <div style={{ marginTop: '1rem' }}>
              <h4 style={{ margin: '0 0 0.35rem' }}>Registered modules</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                {report.coverage.modules.map((m) => (
                  <li key={m.moduleId}>
                    <strong>{m.label}</strong> ({(m.routes ?? []).join(', ') || 'no routes'}) — {m.note}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {report.coverage.recommended?.checklist?.length > 0 && (
            <ul style={{ marginTop: '1rem', paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
              {report.coverage.recommended.checklist.map((item) => (
                <li key={item.label} style={{ marginBottom: '0.35rem' }}>
                  {item.done ? '✓' : '○'} {item.label}
                  {!item.done && item.action && (
                    <span style={{ display: 'block', color: 'var(--muted)', marginLeft: '1rem' }}>
                      {item.action.replace(/\*\*/g, '')}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
          {report.coverage.recommended?.runTestQuery && (
            <p style={{ marginTop: '1rem' }}>
              <Link to={report.coverage.recommended.runTestQuery} className="primary" style={{ display: 'inline-block', padding: '0.5rem 0.75rem', borderRadius: 8, textDecoration: 'none' }}>
                Run broader build verification →
              </Link>
            </p>
          )}
        </div>
      )}

      {report.toolInventory?.length > 0 && (
        <div className="card">
          <h3>Tool execution inventory</h3>
          <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th align="left">Tool</th>
                <th align="left">Executed</th>
                <th align="left">Findings</th>
                <th align="left">Notes</th>
              </tr>
            </thead>
            <tbody>
              {report.toolInventory.map((row) => (
                <tr key={row.tool} style={{ borderTop: '1px solid var(--border)' }}>
                  <td>{row.tool}{row.version ? ` (${row.version})` : ''}</td>
                  <td>{row.executed ? 'yes' : 'no'}</td>
                  <td>{row.findingsCount}</td>
                  <td style={{ color: 'var(--muted)' }}>
                    {row.executed
                      ? row.scope ?? row.evidencePath ?? ''
                      : row.executedReason ?? row.configuredReason ?? row.availableReason ?? ''}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Section
        title="Application defects"
        emptyLabel="None"
        items={appDefects}
        runId={runId}
        expanded={expanded}
        setExpanded={setExpanded}
        onRetest={retestFinding}
      />

      <Section
        title="Runner / tool failures"
        emptyLabel="None"
        items={runnerFailures.filter((f) => f.status === 'fail')}
        runId={runId}
        expanded={expanded}
        setExpanded={setExpanded}
        onRetest={retestFinding}
      />

      <Section
        title="Findings requiring review"
        emptyLabel="None"
        items={review}
        runId={runId}
        expanded={expanded}
        setExpanded={setExpanded}
        onRetest={retestFinding}
      />

      <Section
        title="Blocked"
        emptyLabel="None"
        items={blocked}
        runId={runId}
        expanded={expanded}
        setExpanded={setExpanded}
        onRetest={retestFinding}
      />

      <Section
        title="Not executed"
        emptyLabel="None"
        items={notExecuted}
        runId={runId}
        expanded={expanded}
        setExpanded={setExpanded}
        onRetest={retestFinding}
      />

      <div className="card">
        <button type="button" onClick={() => setShowPassing(!showPassing)}>
          {showPassing ? 'Hide' : 'Show'} successful checks ({passing.length})
        </button>
        {showPassing && passing.map((f) => (
          <FindingRow
            key={f.id}
            f={f}
            runId={runId}
            expanded={expanded}
            setExpanded={setExpanded}
            onRetest={retestFinding}
          />
        ))}
      </div>
    </div>
  );
}
