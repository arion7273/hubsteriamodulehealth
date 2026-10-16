import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { apiUrl } from '../config.js';
import { downloadFromApi } from '../lib/download-export.mjs';
import { copyAndDownloadText, downloadRepairPrompt, fetchRepairPrompt } from '../lib/cursor-prompt-actions.mjs';
import CursorPromptModal from '../components/CursorPromptModal.jsx';
import EvidencePreview from '../components/EvidencePreview.jsx';
import ReportFirstPanel from '../components/ReportFirstPanel.jsx';
import { prerequisiteLabel } from '../lib/report-ui.mjs';
import { categoryLabel } from '@engine/qa-audit-categories.mjs';

function formatMeta(value, unavailable) {
  if (value != null && value !== '') return String(value);
  return unavailable ?? '—';
}

function FindingRow({ f, runId, expanded, setExpanded, onRetest }) {
  const [promptModal, setPromptModal] = useState(null);

  async function openCursorPrompt() {
    const text = await fetchRepairPrompt(runId, { findingIds: [f.id], label: 'This issue' });
    setPromptModal({
      title: `Cursor prompt — ${f.checkId}`,
      text,
      filename: `module-health-${runId}-repair-${f.id}.md`,
    });
  }

  async function downloadPrompt() {
    await downloadRepairPrompt(runId, `module-health-${runId}-repair-${f.id}.md`, {
      findingIds: [f.id],
      label: 'This issue',
    });
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
            <button type="button" onClick={openCursorPrompt}>Cursor prompt…</button>
            <button type="button" onClick={downloadPrompt}>Download prompt</button>
            <button type="button" onClick={() => onRetest(f.checkId)}>Retest this finding</button>
          </>
        )}
      </div>
      <CursorPromptModal
        open={Boolean(promptModal)}
        title={promptModal?.title ?? ''}
        text={promptModal?.text ?? ''}
        downloadName={promptModal?.filename}
        onClose={() => setPromptModal(null)}
      />
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

  function loadReport() {
    return api(`/api/runs/${runId}`).then(setReport);
  }

  useEffect(() => {
    loadReport();
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

  async function copyGapAnalysis() {
    const text = await api(`/api/runs/${runId}/gap-analysis-prompt`, {
      method: 'POST',
      body: JSON.stringify({
        uiOrigin: window.location.origin,
        moduleHealthApiBase: window.location.origin,
      }),
    });
    await copyAndDownloadText(text, `module-health-${runId}-gap-analysis.md`);
  }

  async function copyComprehensiveAudit() {
    const text = await api(`/api/runs/${runId}/comprehensive-audit-prompt`, {
      method: 'POST',
      body: JSON.stringify({
        uiOrigin: window.location.origin,
        moduleHealthApiBase: window.location.origin,
      }),
    });
    await copyAndDownloadText(text, `module-health-${runId}-comprehensive-audit.md`);
  }

  async function copyFixPrompt() {
    const text = await api(`/api/runs/${runId}/fix-prompt`, { method: 'POST', body: JSON.stringify({}) });
    await copyAndDownloadText(text, `module-health-${runId}-fix-prompt.md`);
  }

  async function copyFixAllPrompt() {
    const text = await api(`/api/runs/${runId}/fix-all-prompt`, {
      method: 'POST',
      body: JSON.stringify({
        uiOrigin: window.location.origin,
        moduleHealthApiBase: window.location.origin,
      }),
    });
    await copyAndDownloadText(text, `module-health-${runId}-fix-all-prompt.md`);
  }

  async function copyReportAnalysis() {
    const text = await api(`/api/runs/${runId}/report-analysis-prompt`, {
      method: 'POST',
      body: JSON.stringify({
        uiOrigin: window.location.origin,
        moduleHealthApiBase: window.location.origin,
      }),
    });
    await copyAndDownloadText(text, `module-health-${runId}-report-analysis.md`);
  }

  const failFindings = (report.findings ?? []).filter((f) => f.status === 'fail');
  const sectionFailCount =
    appDefects.length +
    runnerFailures.filter((f) => f.status === 'fail').length +
    review.length;

  const qa = report.qaAudit;
  const auditBase = `/api/runs/${runId}`;

  async function downloadFixAllPrompt() {
    let fallbackText;
    try {
      fallbackText = await api(`/api/runs/${runId}/fix-all-prompt`, {
        method: 'POST',
        body: JSON.stringify({
          uiOrigin: window.location.origin,
          moduleHealthApiBase: window.location.origin,
        }),
      });
    } catch {
      /* fallback via download only */
    }
    await downloadFromApi(`${auditBase}/fix-all-prompt.md`, `module-health-${runId}-fix-all-prompt.md`, {
      fallbackText,
    });
  }

  async function downloadFixPrompt() {
    let fallbackText;
    try {
      fallbackText = await api(`/api/runs/${runId}/fix-prompt`, { method: 'POST', body: JSON.stringify({}) });
    } catch {
      /* use API download only */
    }
    await downloadFromApi(`${auditBase}/fix-prompt.md`, `module-health-${runId}-fix-prompt.md`, {
      fallbackText,
    });
  }

  async function downloadCursorPack() {
    await downloadFromApi(`${auditBase}/cursor-pack.md`, `module-health-${runId}-cursor-pack.md`, {
      fallbackText: qa?.markdown
        ? `# Cursor pack (offline fallback)\n\nServer export route unavailable — attach **qa-audit.md** content and \`report.json\` from this page after restart.\n\n---\n\n${qa.markdown}`
        : undefined,
    });
  }

  async function downloadFullJson() {
    await downloadFromApi(`${auditBase}/export.json`, `module-health-${runId}.json`, {
      fallbackJson: report,
    });
  }

  async function downloadQaAuditMd() {
    await downloadFromApi(`${auditBase}/audit.md?download=1`, `qa-audit-${runId}.md`, {
      fallbackText: qa?.markdown,
    });
  }

  return (
    <div className="stack">
      <h2>{report.appName} — report</h2>
      <p>
        <Link className="primary" style={{ padding: '0.45rem 0.75rem', borderRadius: 8, textDecoration: 'none' }} to={`/reports/${runId}/workspace`}>
          Open AI repair workspace →
        </Link>
      </p>

      <ReportFirstPanel report={report} runId={runId} onRetest={retestFinding} onReportRefresh={loadReport} />

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Quick exports</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Saved under <code>data/runs/{runId}.json</code> and <code>data/exports/{runId}/</code>.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="primary" onClick={copyFixAllPrompt}>Fix-all prompt</button>
          <button type="button" onClick={downloadQaAuditMd}>QA audit (.md)</button>
          <button type="button" onClick={downloadFullJson}>Full JSON</button>
          <a className="primary" style={{ padding: '0.5rem 0.75rem', borderRadius: 8, textDecoration: 'none' }} href={apiUrl(`${auditBase}/audit.html`)} target="_blank" rel="noreferrer">
            Printable HTML
          </a>
          <button type="button" className="primary" onClick={retestFailed}>Retest failed checks</button>
        </div>
      </div>

      <details className="card" style={{ padding: '0.75rem 1rem' }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Extended report, QAV5 export &amp; technical sections</summary>
        <div className="stack" style={{ marginTop: '1rem' }}>

      {failFindings.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(248, 113, 113, 0.45)' }}>
          <h3 style={{ marginTop: 0 }}>What you need to fix ({failFindings.length})</h3>
          <ol style={{ margin: '0 0 0.75rem', paddingLeft: '1.25rem', fontSize: '0.95rem' }}>
            {failFindings.map((f) => (
              <li key={f.id} style={{ marginBottom: '0.5rem' }}>
                <span className={`badge ${f.severity === 'high' || f.severity === 'blocker' ? 'fail' : 'blocked'}`}>
                  {f.severity}
                </span>{' '}
                <code>{f.checkId}</code> — {f.title}
                {f.remediation?.summary && (
                  <div style={{ color: 'var(--muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                    {f.remediation.summary}
                  </div>
                )}
              </li>
            ))}
          </ol>
          <button type="button" className="primary" onClick={copyFixAllPrompt}>
            Copy &amp; download fix-all prompt
          </button>
        </div>
      )}

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Save &amp; download for Cursor</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem', margin: '0 0 0.75rem' }}>
          Each run is saved on the server under <code>data/runs/{runId}.json</code> and{' '}
          <code>data/exports/{runId}/</code>. Use <strong>fix-all prompt</strong> in your app repo; use the full pack
          for audit markdown + JSON.
        </p>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button type="button" className="primary" style={{ padding: '0.5rem 0.75rem', borderRadius: 8 }} onClick={copyFixAllPrompt}>
            Copy &amp; download fix-all prompt
          </button>
          <button
            type="button"
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}
            onClick={downloadFixAllPrompt}
          >
            Download fix-all (.md)
          </button>
          <button type="button" style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)' }} onClick={downloadCursorPack}>
            Download Cursor pack (.md)
          </button>
          <button
            type="button"
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}
            onClick={downloadFullJson}
          >
            Download full report (.json)
          </button>
          <button
            type="button"
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}
            onClick={downloadQaAuditMd}
          >
            Download QA audit (.md)
          </button>
          <button
            type="button"
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)' }}
            onClick={downloadFixPrompt}
          >
            Download fix prompt (.md)
          </button>
        </div>
      </div>

      {report.comparison && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Progress vs earlier runs</h3>
          {report.comparison.headline && <p>{report.comparison.headline}</p>}
          <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>
            First in chain:{' '}
            <Link to={`/reports/${report.comparison.firstRunId}`}>{report.comparison.firstRunId}</Link>
            {' · '}
            Previous:{' '}
            <Link to={`/reports/${report.comparison.previousRunId}`}>{report.comparison.previousRunId}</Link>
          </p>
          <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.9rem' }}>
            <span>
              <strong>{report.comparison.vsFirst?.counts?.fixedCount ?? 0}</strong> fixed
            </span>
            <span>
              <strong>{report.comparison.vsFirst?.counts?.stillFailingCount ?? 0}</strong> still failing
            </span>
            <span>
              <strong>{report.comparison.vsFirst?.counts?.newFailureCount ?? 0}</strong> new
            </span>
            <span style={{ color: 'var(--muted)' }}>
              Fails: {report.comparison.vsFirst?.counts?.baselineFails ?? '—'} →{' '}
              {report.comparison.vsFirst?.counts?.currentFails ?? '—'}
            </span>
          </div>
          {(report.comparison.vsFirst?.fixed?.length ?? 0) > 0 && (
            <>
              <h4 style={{ marginBottom: '0.25rem' }}>Fixed</h4>
              <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.85rem' }}>
                {report.comparison.vsFirst.fixed.map((row) => (
                  <li key={row.checkId}>
                    <code>{row.checkId}</code> — {row.baseline?.title ?? row.checkId}
                  </li>
                ))}
              </ul>
            </>
          )}
          <button type="button" className="primary" style={{ marginTop: '0.75rem' }} onClick={copyFixPrompt}>
            Copy Cursor fix plan (with diff)
          </button>
        </div>
      )}

      {!qa && (
        <div className="card" role="alert" style={{ borderColor: 'rgba(251, 191, 36, 0.55)' }}>
          <h3 style={{ marginTop: 0 }}>QAV5 audit export not loaded</h3>
          <p style={{ margin: '0.5rem 0', fontSize: '0.9rem' }}>
            This page is the <strong>short</strong> dashboard. The consultant-style report needs a{' '}
            <strong>restarted server</strong> and a <strong>fresh web build</strong> (already in repo).
          </p>
          <ol style={{ fontSize: '0.9rem', margin: '0.5rem 0', paddingLeft: '1.25rem' }}>
            <li>Stop the server (Ctrl+C), then run: <code>npm run build:web && npm start</code></li>
            <li>Hard-refresh this tab (Cmd+Shift+R)</li>
            <li>
              Open the QAV5 HTML export:{' '}
              <a href={apiUrl(`${auditBase}/audit.html`)} target="_blank" rel="noreferrer">
                /api/runs/{runId}/audit.html
              </a>
            </li>
            <li>Run a <strong>new</strong> scan from the landing page (paste URL) — uses full QA packs</li>
          </ol>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
            Reference PDF: <a href="/references/qav5.pdf" target="_blank" rel="noreferrer">qav5.pdf</a>
          </p>
        </div>
      )}

      {qa && (
        <div className="card" style={{ borderColor: 'rgba(99, 102, 241, 0.45)' }}>
          <h3 style={{ marginTop: 0 }}>
            {qa.templateLabel ?? 'Website QA Audit Report — V5'}
          </h3>
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
            Consultant-style outline (QAV5): executive summary, scorecard, testing guide checklist, findings by
            category, appendices. Works for <strong>any URL</strong> (adhoc scan) or registered apps. Print HTML to PDF.
            <a href={qa.referencePdfPath ?? '/references/qav5.pdf'} target="_blank" rel="noreferrer" style={{ marginLeft: '0.5rem' }}>
              Open QAV5 reference PDF →
            </a>
          </p>
          {qa.url && qa.url !== '—' && (
            <p style={{ fontSize: '0.95rem' }}>
              <strong>Site under test:</strong> {qa.site} — <code>{qa.url}</code>
            </p>
          )}
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1rem' }}>
            <a className="primary" style={{ padding: '0.5rem 0.75rem', borderRadius: 8, textDecoration: 'none' }} href={apiUrl(`${auditBase}/audit.html`)} target="_blank" rel="noreferrer">
              Open printable HTML →
            </a>
            <button type="button" style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)' }} onClick={downloadQaAuditMd}>
              Download Markdown
            </button>
          </div>
          <p style={{ whiteSpace: 'pre-wrap', fontSize: '0.9rem' }}>{qa.executiveNarrative}</p>
          <h4>Scorecard</h4>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem' }}>
            {['blocker', 'high', 'medium', 'low', 'info'].map((sev) => (
              <div key={sev} style={{ background: '#121a26', borderRadius: 8, padding: '0.5rem 0.75rem', minWidth: '4.5rem' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--muted)', textTransform: 'uppercase' }}>{sev}</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>{qa.scorecard?.severityOpen?.[sev] ?? 0}</div>
              </div>
            ))}
            <div style={{ background: '#121a26', borderRadius: 8, padding: '0.5rem 0.75rem' }}>
              <div style={{ fontSize: '0.7rem', color: 'var(--muted)' }}>Tools ran</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700 }}>
                {qa.scorecard?.toolsExecuted ?? 0}/{qa.scorecard?.toolsTotal ?? 0}
              </div>
            </div>
          </div>
          {(qa.testingGuideChecklist?.length ?? 0) > 0 && (
            <>
              <h4>Testing guide checklist</h4>
              <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                <tbody>
                  {qa.testingGuideChecklist.map((row) => (
                    <tr key={row.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td>{row.label}</td>
                      <td>
                        <span className={`badge ${row.status === 'pass' ? 'pass' : row.status === 'fail' ? 'fail' : 'blocked'}`}>
                          {row.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {(qa.topConcerns?.length ?? 0) > 0 && (
            <>
              <h4>Top concerns</h4>
              <ol style={{ fontSize: '0.9rem' }}>
                {qa.topConcerns.map((c) => (
                  <li key={c.checkId}>
                    <strong>[{c.severity}]</strong> {c.title} — {c.summary ?? ''}
                  </li>
                ))}
              </ol>
            </>
          )}
          {qa.testingLimitations?.length > 0 && (
            <>
              <h4>Testing limitations (appendix)</h4>
              <ul style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {qa.testingLimitations.map((t) => (
                  <li key={t}>{t}</li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

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
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.5rem' }}>
          <button type="button" className="primary" onClick={retestFailed}>Rerun failed checks</button>
          <button type="button" onClick={copyFixAllPrompt}>Copy &amp; download fix-all prompt</button>
          <button type="button" onClick={downloadFixAllPrompt}>Download fix-all only</button>
          <button type="button" onClick={copyFixPrompt}>Copy &amp; download fix plan</button>
          <button type="button" onClick={downloadFixPrompt}>Download fix plan only</button>
          <Link
            to={`/run?app=${report.appId}&preset=comprehensive-build-url&inputMode=url&packs=quick-health%2Cui-a11y&levels=1%2C2%2C4`}
            style={{ padding: '0.5rem 0.75rem', borderRadius: 8, border: '1px solid var(--border)', textDecoration: 'none' }}
          >
            Run comprehensive URL test
          </Link>
          <button type="button" onClick={copyGapAnalysis}>Copy gap analysis prompt</button>
          <button type="button" onClick={copyComprehensiveAudit}>Copy comprehensive audit prompt</button>
          <button type="button" onClick={copyReportAnalysis}>Copy report analysis prompt</button>
        </div>
      </div>

      {report.executiveSummary?.items?.length > 0 && (
        <div className="card">
          <h3>Executive summary — gaps &amp; critical issues ({report.executiveSummary.itemCount})</h3>
          {report.executiveSummary.coverageNote && (
            <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{report.executiveSummary.coverageNote}</p>
          )}
          <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
            {report.executiveSummary.items.map((item) => (
              <li key={item.findingId} style={{ marginBottom: '0.75rem' }}>
                <span className={`badge ${item.severity === 'blocker' || item.severity === 'high' ? 'fail' : 'blocked'}`}>
                  {item.severity}
                </span>
                <strong> {item.title}</strong>
                <span style={{ color: 'var(--muted)' }}> — {item.sectionLabel}</span>
                {item.userImpact && (
                  <p style={{ margin: '0.25rem 0', color: 'var(--muted)' }}>Impact: {item.userImpact}</p>
                )}
                {item.remediationSummary && (
                  <p style={{ margin: '0.25rem 0' }}>Fix: {item.remediationSummary}</p>
                )}
                {item.evidenceRefs?.length > 0 && (
                  <p style={{ margin: '0.25rem 0', fontSize: '0.8rem', color: 'var(--muted)' }}>
                    Evidence: {item.evidenceRefs.join(' · ')}
                  </p>
                )}
                {item.checkId && (
                  <button type="button" style={{ marginTop: '0.25rem' }} onClick={() => retestFinding(item.retestCheckId)}>
                    Retest {item.checkId}
                  </button>
                )}
              </li>
            ))}
          </ol>
        </div>
      )}

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

      {failFindings.length > 0 && sectionFailCount === 0 && (
        <div className="card" role="alert" style={{ borderColor: 'rgba(251, 191, 36, 0.5)' }}>
          <h3>Failures not mapped to sections</h3>
          <p style={{ color: 'var(--muted)' }}>Showing raw fail findings — report was restructured; refresh if this persists.</p>
          {failFindings.map((f) => (
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
      )}

      {qa?.findingsByCategory && (
        <div className="card">
          <h3>Findings by category (audit view)</h3>
          {Object.entries(qa.findingsByCategory)
            .filter(([, items]) => items.length > 0)
            .map(([catId, items]) => (
              <div key={catId} style={{ marginBottom: '1.25rem' }}>
                <h4 style={{ margin: '0 0 0.5rem' }}>
                  {categoryLabel(catId)} ({items.length})
                </h4>
                {items.map((f) => (
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
            ))}
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
      </details>
    </div>
  );
}
