import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import EvidencePreview from '../components/EvidencePreview.jsx';
import CursorPromptModal from '../components/CursorPromptModal.jsx';
import '../styles/workspace.css';

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'issues', label: 'Issues' },
  { id: 'repair', label: 'Repair' },
  { id: 'verification', label: 'Verification' },
  { id: 'history', label: 'History' },
];

export default function ReportWorkspace() {
  const { runId } = useParams();
  const [tab, setTab] = useState('overview');
  const [ws, setWs] = useState(null);
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(() => new Set());
  const [activeRepairId, setActiveRepairId] = useState(null);
  const [prompt, setPrompt] = useState({ open: false, text: '', title: '' });
  const [issueQuery, setIssueQuery] = useState('');

  const load = useCallback(() => api(`/api/runs/${runId}/workspace`).then(setWs), [runId]);

  useEffect(() => {
    load().catch((e) => setError(e?.message ?? 'Failed to load workspace'));
  }, [load]);

  useEffect(() => {
    if (!ws || ws.ai.status === 'complete' || ws.ai.status === 'failed' || ws.ai.status === 'disabled') return;
    const t = setInterval(() => load().catch(() => {}), 2500);
    return () => clearInterval(t);
  }, [ws?.ai?.status, load]);

  const filteredIssues = useMemo(() => {
    const q = issueQuery.trim().toLowerCase();
    const items = ws?.issues?.items ?? [];
    if (!q) return items;
    return items.filter(
      (i) =>
        i.title?.toLowerCase().includes(q) ||
        i.checkId?.toLowerCase().includes(q) ||
        i.findingId?.toLowerCase().includes(q),
    );
  }, [ws, issueQuery]);

  async function queueAnalyze(force = false) {
    setBusy('analyze');
    setError(null);
    try {
      await api(`/api/runs/${runId}/workspace/analyze`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      await load();
    } catch (e) {
      setError(e?.message ?? 'Analysis failed');
    } finally {
      setBusy(null);
    }
  }

  async function createPlan() {
    const findingIds = [...selected];
    if (!findingIds.length) return;
    setBusy('plan');
    try {
      const { repairId, plan } = await api(`/api/runs/${runId}/workspace/repair/plan`, {
        method: 'POST',
        body: JSON.stringify({ findingIds }),
      });
      setActiveRepairId(repairId);
      setPrompt({ open: true, title: 'Repair plan — Cursor prompt', text: plan.cursorPrompt });
      await load();
    } catch (e) {
      setError(e?.message ?? 'Plan failed');
    } finally {
      setBusy(null);
    }
  }

  async function generatePatch() {
    if (!activeRepairId) return;
    setBusy('patch');
    try {
      await api(`/api/runs/${runId}/workspace/repair/${activeRepairId}/patch`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setError(e?.message ?? 'Patch generation failed');
    } finally {
      setBusy(null);
    }
  }

  async function applyPatch() {
    if (!activeRepairId) return;
    setBusy('apply');
    try {
      await api(`/api/runs/${runId}/workspace/repair/${activeRepairId}/apply`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await load();
    } catch (e) {
      setError(e?.message ?? 'Apply failed');
    } finally {
      setBusy(null);
    }
  }

  async function runVerify() {
    if (!activeRepairId) return;
    setBusy('verify');
    try {
      await api(`/api/runs/${runId}/workspace/repair/${activeRepairId}/verify`, {
        method: 'POST',
        body: JSON.stringify({ verifyCommandId: 'verify:workflows' }),
      });
      await load();
      setTab('verification');
    } catch (e) {
      setError(e?.message ?? 'Verification failed');
    } finally {
      setBusy(null);
    }
  }

  if (!ws) {
    return (
      <div className="ws-page">
        <p className="ws-muted">Loading repair workspace…</p>
        {error && <p className="ws-error">{error}</p>}
      </div>
    );
  }

  const ai = ws.ai;
  const activeRepair = ws.repair.items.find((r) => r.id === activeRepairId) ?? ws.repair.items[ws.repair.items.length - 1];

  return (
    <div className="ws-page">
      <header className="ws-header">
        <div>
          <p className="ws-kicker">Module Health · Repair workspace</p>
          <h1 className="ws-title">{ws.overview.target.appName}</h1>
          <p className="ws-sub">
            <code>{runId}</code> · {ws.overview.target.environment} · {ws.overview.target.buildLabel}
          </p>
        </div>
        <div className="ws-header-actions">
          <Link className="ws-btn ws-btn-ghost" to={`/reports/${runId}`}>Classic report</Link>
          <button type="button" className="ws-btn ws-btn-primary" disabled={busy === 'analyze'} onClick={() => queueAnalyze(false)}>
            {busy === 'analyze' ? 'Working…' : ai.status === 'complete' ? 'Re-analyze' : 'Analyze evidence'}
          </button>
        </div>
      </header>

      <nav className="ws-tabs" aria-label="Workspace sections">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`ws-tab ${tab === t.id ? 'ws-tab-active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {error && <div className="ws-banner ws-banner-error" role="alert">{error}</div>}

      <div className="ws-ai-strip" role="status">
        <span className={`ws-pill ws-pill-${ai.status}`}>AI: {ai.status}</span>
        {ai.activeRevision?.analysis?.message && <span className="ws-muted">{ai.activeRevision.analysis.message.slice(0, 160)}…</span>}
        {ai.lastError && <span className="ws-error">{ai.lastError}</span>}
        {ai.disclaimer && <span className="ws-muted ws-disclaimer">{ai.disclaimer}</span>}
      </div>

      {tab === 'overview' && (
        <section className="ws-panel">
          <h2>Overview</h2>
          <p className="ws-lead">{ws.overview.decision.explanation}</p>
          <div className="ws-metrics">
            <div className="ws-metric"><span>App failures</span><strong>{ws.overview.separates.applicationFailures}</strong></div>
            <div className="ws-metric"><span>Runner errors</span><strong>{ws.overview.separates.runnerFailures}</strong></div>
            <div className="ws-metric"><span>Blocked</span><strong>{ws.overview.separates.blocked}</strong></div>
            <div className="ws-metric"><span>Not tested</span><strong>{ws.overview.separates.notTested}</strong></div>
          </div>
          <h3>Next actions</h3>
          <ol className="ws-list">{ws.overview.nextActions.map((a) => <li key={a}>{a}</li>)}</ol>
          {ws.overview.comparisonSummary && (
            <p className="ws-muted">
              Baseline <Link to={`/reports/${ws.overview.comparisonSummary.baselineRunId}/workspace`}>{ws.overview.comparisonSummary.baselineRunId}</Link>
              {ws.overview.comparisonSummary.notComparable && ' — comparison approximate'}
            </p>
          )}
        </section>
      )}

      {tab === 'issues' && (
        <section className="ws-panel">
          <div className="ws-toolbar">
            <input
              className="ws-input"
              placeholder="Search issues…"
              value={issueQuery}
              onChange={(e) => setIssueQuery(e.target.value)}
            />
            <button type="button" className="ws-btn" disabled={selected.size === 0} onClick={createPlan}>
              Repair selected ({selected.size})
            </button>
          </div>
          {filteredIssues.map((issue) => (
            <article key={issue.findingId} className="ws-issue-card">
              <div className="ws-issue-head">
                <input
                  type="checkbox"
                  checked={selected.has(issue.findingId)}
                  onChange={() => {
                    setSelected((prev) => {
                      const n = new Set(prev);
                      if (n.has(issue.findingId)) n.delete(issue.findingId);
                      else n.add(issue.findingId);
                      return n;
                    });
                  }}
                />
                <span className={`ws-sev ws-sev-${issue.severity}`}>{issue.severity}</span>
                <strong>{issue.title}</strong>
                <code>{issue.checkId}</code>
                <span className="ws-measured">Measured: {issue.measuredStatus}</span>
              </div>
              <p><strong>Expected:</strong> {issue.expected}</p>
              <p><strong>Actual:</strong> {issue.actual}</p>
              {issue.aiNote && (
                <details>
                  <summary>AI explanation ({issue.aiNote.confidence})</summary>
                  <p>{issue.aiNote.fixHint}</p>
                  <p className="ws-muted">{issue.aiNote.suspectedCause}</p>
                </details>
              )}
              <EvidencePreview evidence={issue.evidence} />
            </article>
          ))}
        </section>
      )}

      {tab === 'repair' && (
        <section className="ws-panel">
          <p className="ws-muted">Mode: <strong>{ws.repair.mode}</strong>{ws.repair.repoRoot ? ` · ${ws.repair.repoRoot}` : ' — URL mode uses Cursor prompts; patches need repo path.'}</p>
          {!activeRepair && <p>Select issues on the Issues tab, then create a repair plan.</p>}
          {activeRepair && (
            <>
              <p>Repair <code>{activeRepair.id}</code> — status <strong>{activeRepair.status}</strong></p>
              <p>{activeRepair.plan?.summary}</p>
              <div className="ws-toolbar">
                <button type="button" className="ws-btn ws-btn-primary" onClick={() => setPrompt({ open: true, title: 'Cursor prompt', text: activeRepair.plan?.cursorPrompt ?? '' })}>
                  Open Cursor prompt
                </button>
                <button type="button" className="ws-btn" disabled={busy === 'patch' || ws.repair.mode !== 'repository'} onClick={generatePatch}>
                  Generate patch
                </button>
                <button type="button" className="ws-btn" disabled={!activeRepair.patch || busy === 'apply'} onClick={applyPatch}>
                  {busy === 'apply' ? 'Applying…' : 'Apply patch'}
                </button>
                <button type="button" className="ws-btn" disabled={!activeRepair.patch} onClick={runVerify}>
                  Verify (retest)
                </button>
              </div>
              {activeRepair.patch && (
                <details open>
                  <summary>Patch ({activeRepair.patch.generatedBy ?? activeRepair.patch.generatedAt ? 'ai' : 'template'})</summary>
                  <p className="ws-muted">{activeRepair.patch.rationale}</p>
                  {(activeRepair.patch.diffs ?? []).map((d) => (
                    <details key={d.path}>
                      <summary><code>{d.path}</code></summary>
                      <pre className="ws-pre ws-diff">{d.unifiedDiff}</pre>
                    </details>
                  ))}
                  {!activeRepair.patch.diffs?.length && (
                    <pre className="ws-pre">{JSON.stringify(activeRepair.patch.files?.map((f) => f.path) ?? [], null, 2)}</pre>
                  )}
                </details>
              )}
              {activeRepair.blockedReason && <p className="ws-error">{activeRepair.blockedReason}</p>}
            </>
          )}
        </section>
      )}

      {tab === 'verification' && (
        <section className="ws-panel">
          <p className="ws-muted">A generated patch is not verified until checks pass on a linked retest.</p>
          {(ws.verification.runs ?? []).length === 0 && <p>No verification runs yet.</p>}
          {ws.repair.items.map((r) => (
            <article key={r.id} className="ws-issue-card">
              <strong>{r.id}</strong> — {r.status}
              {r.verification?.retestRunId && (
                <p>
                  Retest: <Link to={`/reports/${r.verification.retestRunId}/workspace`}>{r.verification.retestRunId}</Link>
                  {r.verification.verifiedFixed ? ' · verified fixed' : ' · not verified'}
                </p>
              )}
              {r.verification?.commands?.map((c) => (
                <p key={c.id}><code>{c.id}</code> exit {c.exitCode}</p>
              ))}
            </article>
          ))}
        </section>
      )}

      {tab === 'history' && (
        <section className="ws-panel">
          <h3>Comparison</h3>
          <ul className="ws-list">
            <li>Verified fixed: {ws.history.verifiedFixed?.length ?? 0}</li>
            <li>Still failing: {ws.history.stillFailing?.length ?? 0}</li>
            <li>New: {ws.history.newFailures?.length ?? 0}</li>
            <li>Not retested: {ws.history.notRetested?.length ?? 0}</li>
          </ul>
          {ws.history.policyNote && <p className="ws-muted">{ws.history.policyNote}</p>}
        </section>
      )}

      <CursorPromptModal
        open={prompt.open}
        title={prompt.title}
        text={prompt.text}
        downloadName={`workspace-${runId}.md`}
        onClose={() => setPrompt({ open: false, text: '', title: '' })}
      />
    </div>
  );
}
