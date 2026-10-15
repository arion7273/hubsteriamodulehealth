import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { downloadRepairPrompt, fetchRepairPrompt } from '../lib/cursor-prompt-actions.mjs';
import CursorPromptModal from './CursorPromptModal.jsx';
import EvidencePreview from './EvidencePreview.jsx';

function ChangeList({ title, items, renderItem }) {
  if (!items?.length) return null;
  return (
    <div style={{ marginTop: '0.75rem' }}>
      <h4 style={{ margin: '0 0 0.35rem' }}>{title} ({items.length})</h4>
      <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>{items.map(renderItem)}</ul>
    </div>
  );
}

export default function ReportFirstPanel({ report, runId, onRetest, onReportRefresh }) {
  const rf = report.reportFirst;
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [severity, setSeverity] = useState('all');
  const [tool, setTool] = useState('all');
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(null);
  const [prompt, setPrompt] = useState({ open: false, title: '', text: '' });

  const cards = rf?.fixTheseFirst?.cards ?? [];
  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (severity !== 'all' && c.severity !== severity) return false;
      if (tool !== 'all' && c.sourceTool !== tool) return false;
      return true;
    });
  }, [cards, severity, tool]);

  const tools = useMemo(() => [...new Set(cards.map((c) => c.sourceTool).filter(Boolean))], [cards]);

  async function runAiAnalysis(force = false) {
    setAiBusy(true);
    setAiError(null);
    try {
      await api(`/api/runs/${runId}/ai-analysis`, {
        method: 'POST',
        body: JSON.stringify({ force }),
      });
      onReportRefresh?.();
    } catch (e) {
      setAiError(e?.message ?? 'AI analysis failed');
    } finally {
      setAiBusy(false);
    }
  }

  if (!rf) {
    return (
      <div className="card" role="status">
        <p>Report-first view not loaded — restart the server and refresh.</p>
      </div>
    );
  }

  function toggleSelect(id) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function openRepairPrompt(findingIds, label) {
    const text = await fetchRepairPrompt(runId, { findingIds, label });
    const count = findingIds?.length ?? cards.length;
    const ids = findingIds?.length ? findingIds.join(', ') : cards.map((c) => c.findingId).join(', ');
    setPrompt({
      open: true,
      title: `${label} (${count} issue(s))`,
      text,
      meta: ids,
    });
  }

  const changes = rf.changesSincePreviousRun;

  return (
    <>
      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>A. Action summary</h2>
        <p><strong>Gate:</strong> {rf.actionSummary.gate}</p>
        <p>{rf.actionSummary.headline}</p>
        {rf.actionSummary.runCompletion.honestHealthNote && (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{rf.actionSummary.runCompletion.honestHealthNote}</p>
        )}
        {rf.actionSummary.workflowsBlocked.length > 0 && (
          <p><strong>Blocked workflows:</strong> {rf.actionSummary.workflowsBlocked.map((w) => w.checkId).join(', ')}</p>
        )}
        <h4 style={{ marginBottom: '0.25rem' }}>Highest priority</h4>
        <ol style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.9rem' }}>
          {rf.actionSummary.highestPriorityIssues.map((i) => (
            <li key={i.findingId}>
              <span className={`badge ${i.severity === 'high' || i.severity === 'blocker' ? 'fail' : 'blocked'}`}>{i.severity}</span>
              {i.title} <code>{i.checkId}</code>
            </li>
          ))}
        </ol>
        <h4 style={{ marginTop: '0.75rem' }}>Recommended next</h4>
        <ul style={{ fontSize: '0.9rem' }}>
          {rf.actionSummary.recommendedNextActions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Completion: {rf.actionSummary.runCompletion.completed} completed · {rf.actionSummary.runCompletion.blocked} blocked ·{' '}
          {rf.actionSummary.runCompletion.notExecuted} not executed
        </p>
        <div
          style={{
            marginTop: '0.75rem',
            padding: '0.75rem',
            borderRadius: 8,
            border: '1px solid var(--border)',
            background: 'rgba(255,255,255,0.02)',
          }}
          aria-live="polite"
        >
          <strong>AI analysis</strong>
          <span className="badge blocked" style={{ marginLeft: '0.5rem' }}>{rf.aiAnalysis.status}</span>
          <p style={{ fontSize: '0.85rem', margin: '0.5rem 0' }}>{rf.aiAnalysis.message}</p>
          {(rf.aiAnalysis.status === 'pending' ||
            rf.aiAnalysis.status === 'disabled' ||
            rf.aiAnalysis.status === 'failed' ||
            rf.aiAnalysis.status === 'complete') && (
            <button type="button" disabled={aiBusy || rf.aiAnalysis.status === 'disabled'} onClick={() => runAiAnalysis(false)}>
              {aiBusy ? 'Analyzing…' : 'Run AI analysis'}
            </button>
          )}
          {rf.aiAnalysis.status === 'complete' && (
            <button type="button" style={{ marginLeft: '0.5rem' }} disabled={aiBusy} onClick={() => runAiAnalysis(true)}>
              Re-run
            </button>
          )}
          {aiError && <p style={{ color: 'var(--fail, #f87171)', fontSize: '0.85rem' }}>{aiError}</p>}
          {rf.aiAnalysis.repairOrder?.length > 0 && (
            <>
              <h4 style={{ marginBottom: '0.25rem' }}>Suggested repair order</h4>
              <ol style={{ fontSize: '0.85rem', paddingLeft: '1.25rem' }}>
                {rf.aiAnalysis.repairOrder.map((r) => (
                  <li key={r.findingId}>
                    <code>{r.findingId}</code> — {r.rationale}
                  </li>
                ))}
              </ol>
            </>
          )}
          {rf.aiAnalysis.findingNotes?.length > 0 && (
            <details style={{ fontSize: '0.85rem' }}>
              <summary>Per-finding AI notes (suggestions only)</summary>
              <ul>
                {rf.aiAnalysis.findingNotes.map((n) => (
                  <li key={n.findingId}>
                    <code>{n.findingId}</code> ({n.confidence}): {n.fixHint}
                  </li>
                ))}
              </ul>
            </details>
          )}
          {rf.aiAnalysis.status === 'disabled' && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
              Add <code>AI_GATEWAY_API_KEY</code> to <code>.env</code> at repo root and restart <code>npm start</code>.
            </p>
          )}
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>B. Fix these first</h2>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
          <label>
            Severity{' '}
            <select value={severity} onChange={(e) => setSeverity(e.target.value)}>
              <option value="all">All</option>
              <option value="blocker">blocker</option>
              <option value="high">high</option>
              <option value="medium">medium</option>
              <option value="low">low</option>
            </select>
          </label>
          <label>
            Tool{' '}
            <select value={tool} onChange={(e) => setTool(e.target.value)}>
              <option value="all">All</option>
              {tools.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </label>
          <button type="button" className="primary" onClick={() => openRepairPrompt(null, 'All open issues')}>
            Cursor prompt — all open ({cards.length})
          </button>
          <button
            type="button"
            onClick={() =>
              downloadRepairPrompt(runId, `module-health-${runId}-repair-all.md`, { label: 'All open issues' })
            }
          >
            Download all
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() => openRepairPrompt([...selected], 'Selected issues')}
          >
            Cursor prompt — selected ({selected.size})
          </button>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={() =>
              downloadRepairPrompt(runId, `module-health-${runId}-repair-selected.md`, {
                findingIds: [...selected],
                label: 'Selected issues',
              })
            }
          >
            Download selected
          </button>
        </div>
        {filtered.length === 0 ? (
          <p>No open failures match filters.</p>
        ) : (
          filtered.map((c) => (
            <article
              key={c.findingId}
              style={{ borderTop: '1px solid var(--border)', padding: '0.75rem 0' }}
              aria-labelledby={`card-${c.findingId}`}
            >
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  aria-label={`Select ${c.title}`}
                  checked={selected.has(c.findingId)}
                  onChange={() => toggleSelect(c.findingId)}
                />
                <span className="badge fail">{c.severity}</span>
                <strong id={`card-${c.findingId}`}>{c.title}</strong>
                <code style={{ fontSize: '0.75rem' }}>{c.checkId}</code>
              </div>
              <p style={{ fontSize: '0.85rem', margin: '0.35rem 0' }}>{c.severityRationale}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Impact:</strong> {c.userImpact}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Fix:</strong> {c.recommendedFix}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {c.cause.label}: {c.cause.confirmed ?? c.cause.suspected ?? 'Not available'}
              </p>
              <details style={{ fontSize: '0.85rem' }}>
                <summary>Acceptance &amp; verification</summary>
                <ul>
                  {c.acceptanceCriteria.map((a) => (
                    <li key={a}>{a}</li>
                  ))}
                </ul>
                <p>Verify: {c.verificationChecks.map((v) => `\`${v}\``).join(', ')}</p>
              </details>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.35rem' }}>
                <button type="button" onClick={() => openRepairPrompt([c.findingId], 'This issue')}>
                  Cursor prompt…
                </button>
                <button
                  type="button"
                  onClick={() =>
                    downloadRepairPrompt(runId, `module-health-${runId}-repair-${c.findingId}.md`, {
                      findingIds: [c.findingId],
                      label: 'This issue',
                    })
                  }
                >
                  Download prompt
                </button>
                <button type="button" onClick={() => setExpanded(expanded === c.findingId ? null : c.findingId)}>
                  {expanded === c.findingId ? 'Hide evidence' : 'View evidence'}
                </button>
                {c.checkId && (
                  <button type="button" onClick={() => onRetest(c.checkId)}>Retest this issue</button>
                )}
              </div>
              {expanded === c.findingId && <EvidencePreview evidence={c.evidence} />}
            </article>
          ))
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>C. Changes since previous run</h2>
        {!changes?.available ? (
          <p>{changes?.message}</p>
        ) : (
          <>
            {changes.notComparable && (
              <p style={{ color: 'var(--warn, orange)' }}>
                Comparison may be unreliable: {changes.comparabilityIssues?.join('; ')}
              </p>
            )}
            <p>
              Baseline: <Link to={`/reports/${changes.baselineRunId}`}>{changes.baselineRunId}</Link>
            </p>
            <ChangeList
              title="Verified fixed"
              items={changes.verifiedFixed}
              renderItem={(row) => (
                <li key={row.identityKey}><code>{row.checkId}</code> — {row.title}</li>
              )}
            />
            <ChangeList
              title="Still failing"
              items={changes.stillFailing}
              renderItem={(row) => (
                <li key={row.current.identityKey}><code>{row.current.checkId}</code> — {row.current.title}</li>
              )}
            />
            <ChangeList
              title="New failures"
              items={changes.newFailures}
              renderItem={(row) => (
                <li key={row.current.identityKey}><code>{row.current.checkId}</code> — {row.current.title}</li>
              )}
            />
            <ChangeList
              title="Returned (regression)"
              items={changes.returned}
              renderItem={(row) => (
                <li key={row.current.identityKey}><code>{row.current.checkId}</code> — {row.current.title}</li>
              )}
            />
            <ChangeList
              title="Not retested"
              items={changes.notRetested}
              renderItem={(row) => (
                <li key={row.identityKey ?? row.checkId}>
                  <code>{row.checkId}</code> — {row.reason ?? row.title}
                </li>
              )}
            />
          </>
        )}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>D. Module / workflow results</h2>
        {rf.moduleWorkflowResults.map((mod) => (
          <details key={mod.id} style={{ marginBottom: '0.5rem' }}>
            <summary>{mod.label} ({mod.findings.length})</summary>
            <ul style={{ fontSize: '0.85rem' }}>
              {mod.findings.map((f) => (
                <li key={f.checkId}>
                  <span className={`badge ${f.status === 'pass' ? 'pass' : f.status === 'fail' ? 'fail' : 'blocked'}`}>
                    {f.status}
                  </span>
                  {f.title} {f.note && <em style={{ color: 'var(--muted)' }}>— {f.note}</em>}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>E. Coverage &amp; limitations</h2>
        <p style={{ fontSize: '0.9rem' }}>
          Outcomes: pass {rf.coverageAndLimitations.outcomes.pass} · fail {rf.coverageAndLimitations.outcomes.fail} · blocked{' '}
          {rf.coverageAndLimitations.outcomes.blocked} · not tested {rf.coverageAndLimitations.outcomes.not_tested}
        </p>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{rf.scorecard.note}</p>
        <h4>Tools executed</h4>
        <ul style={{ fontSize: '0.85rem' }}>
          {rf.coverageAndLimitations.toolsExecuted.map((t) => (
            <li key={t.tool}>{t.tool}</li>
          ))}
        </ul>
        <h4>Tools not run</h4>
        <ul style={{ fontSize: '0.85rem' }}>
          {rf.coverageAndLimitations.toolsUnavailable.slice(0, 10).map((t) => (
            <li key={t.tool}>{t.tool}: {t.executedReason ?? t.configuredReason}</li>
          ))}
        </ul>
        <h4>Evidence modes</h4>
        <ul style={{ fontSize: '0.85rem' }}>
          {rf.capabilityModes.map((m) => (
            <li key={m.id}>
              {m.active ? '✓' : '○'} {m.label} {m.note && <span style={{ color: 'var(--muted)' }}>({m.note})</span>}
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>F. Technical evidence</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Expand a finding in section B for selectors and excerpts. Artifact directory:{' '}
          {report.meta?.artifactDir ?? 'Not available'}
        </p>
        <ul style={{ fontSize: '0.85rem' }}>
          {(rf.technicalEvidence ?? []).slice(0, 12).map((e) => (
            <li key={e.findingId}>
              <code>{e.checkId}</code> — {e.evidence?.length ?? 0} evidence item(s)
            </li>
          ))}
        </ul>
      </div>

      <CursorPromptModal
        open={prompt.open}
        title={prompt.title}
        text={prompt.text}
        downloadName={`repair-${runId}.md`}
        onClose={() => setPrompt({ open: false, title: '', text: '' })}
      />
    </>
  );
}
