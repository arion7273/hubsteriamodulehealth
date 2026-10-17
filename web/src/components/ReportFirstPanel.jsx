import { useEffect, useMemo, useState } from 'react';
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
  const [issueKind, setIssueKind] = useState('application');
  const [selected, setSelected] = useState(() => new Set());
  const [expanded, setExpanded] = useState(null);
  const [prompt, setPrompt] = useState({ open: false, title: '', text: '' });
  const [gapLimit, setGapLimit] = useState(12);
  const [baselineRunId, setBaselineRunId] = useState(null);
  const [customComparison, setCustomComparison] = useState(null);

  const decision = rf?.decision;
  const appCards = rf?.fixTheseFirst?.applicationCards ?? [];
  const execCards = rf?.fixTheseFirst?.executionCards ?? [];
  const cards =
    issueKind === 'application'
      ? appCards
      : issueKind === 'execution'
        ? execCards
        : [...appCards, ...execCards];
  const filtered = useMemo(() => {
    return cards.filter((c) => {
      if (severity !== 'all' && c.severity !== severity) return false;
      if (tool !== 'all' && c.sourceTool !== tool) return false;
      return true;
    });
  }, [cards, severity, tool]);

  useEffect(() => {
    const visible = new Set(filtered.map((c) => c.findingId));
    setSelected((prev) => {
      const next = new Set([...prev].filter((id) => visible.has(id)));
      return next.size === prev.size ? prev : next;
    });
  }, [filtered]);

  const tools = useMemo(() => [...new Set(cards.map((c) => c.sourceTool).filter(Boolean))], [cards]);

  const defaultChanges = rf?.changesSincePreviousRun;

  useEffect(() => {
    if (!baselineRunId && defaultChanges?.baselineRunId) {
      setBaselineRunId(defaultChanges.baselineRunId);
    }
  }, [defaultChanges?.baselineRunId, baselineRunId]);

  useEffect(() => {
    if (!runId || !baselineRunId) {
      setCustomComparison(null);
      return;
    }
    api(`/api/runs/${runId}/comparison?baselineRunId=${encodeURIComponent(baselineRunId)}`)
      .then((data) => setCustomComparison(data.available ? data.changes : null))
      .catch(() => setCustomComparison(null));
  }, [runId, baselineRunId]);

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

  const changes = customComparison
    ? {
        available: true,
        baselineRunId,
        currentRunId: runId,
        notComparable: !customComparison.comparability?.comparable,
        comparabilityIssues: customComparison.comparability?.issues,
        verifiedFixed: customComparison.verifiedFixed,
        possiblyFixed: customComparison.possiblyFixed,
        stillFailing: customComparison.stillFailing,
        newFailures: customComparison.newFailures,
        returned: customComparison.returned,
        notRetested: customComparison.notRetested,
        counts: customComparison.counts,
        verificationPolicy: customComparison.verificationPolicy,
      }
    : rf.changesSincePreviousRun;

  const recClass =
    decision?.recommendation === 'PASSED_TESTED_SCOPE'
      ? 'pass'
      : decision?.recommendation === 'COMPLETE_MISSING_CHECKS'
        ? 'blocked'
        : 'fail';

  return (
    <>
      <div className="card" style={{ borderColor: 'rgba(99, 102, 241, 0.35)' }}>
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Decision</h2>
        {decision && (
          <>
            <p style={{ fontSize: '0.9rem', margin: '0 0 0.5rem' }}>
              <strong>{decision.runContext.appName}</strong> ·{' '}
              <code style={{ wordBreak: 'break-all' }}>{decision.runContext.targetUrl ?? 'URL not recorded'}</code>
              <br />
              {decision.runContext.environment} · {decision.runContext.inputModeLabel} · {decision.runContext.runAtLabel}{' '}
              ({decision.runContext.timezone})
              <br />
              {decision.runContext.buildLabel}
              {decision.runContext.retestOf && (
                <>
                  {' '}
                  · Retest of <Link to={`/reports/${decision.runContext.retestOf}`}>{decision.runContext.retestOf}</Link>
                </>
              )}
            </p>
            <p>
              <span className={`badge ${recClass}`} style={{ fontSize: '0.85rem' }}>
                {decision.recommendationLabel}
              </span>
            </p>
            <p style={{ fontSize: '0.95rem' }}>{decision.explanation}</p>
            {decision.evidenceBullets?.length > 0 && (
              <ul style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
                {decision.evidenceBullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            <h4 style={{ marginBottom: '0.25rem' }}>Next actions</h4>
            <ol style={{ fontSize: '0.9rem', paddingLeft: '1.25rem', margin: 0 }}>
              {decision.nextActions.map((a) => (
                <li key={a}>{a}</li>
              ))}
            </ol>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.5rem',
                marginTop: '0.75rem',
                fontSize: '0.8rem',
              }}
            >
              {decision.outcomes?.definitions?.map((d) => (
                <div key={d.id} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: '0.5rem' }}>
                  <strong>{d.label}</strong>: {decision.outcomes.counts[d.id] ?? 0}
                  <div style={{ color: 'var(--muted)', marginTop: '0.2rem' }}>{d.definition}</div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)', marginTop: '0.5rem' }}>
              Application issues: {decision.separates.applicationIssues} · Scanner failures:{' '}
              {decision.separates.runnerFailures} · Blocked: {decision.separates.setupBlockers} · Not executed:{' '}
              {decision.separates.notExecuted}. {decision.outcomes?.completionNote}
            </p>
          </>
        )}
      </div>

      {rf.repairPlan?.steps?.length > 0 && (
        <div className="card">
          <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>Repair plan</h2>
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{rf.repairPlan.note}</p>
          {(rf.repairPlan.sections?.length ? rf.repairPlan.sections : [{ id: 'all', label: 'All steps', steps: rf.repairPlan.steps }]).map(
            (sec) => (
              <div key={sec.id} style={{ marginTop: '0.75rem' }}>
                <h3 style={{ fontSize: '0.95rem', margin: '0 0 0.35rem' }}>{sec.label}</h3>
                <ol style={{ fontSize: '0.9rem', paddingLeft: '1.25rem', margin: 0 }}>
                  {sec.steps.map((s) => (
                    <li key={`${s.order}-${s.findingId ?? s.checkId ?? s.title}`} style={{ marginBottom: '0.35rem' }}>
                      <span className={`badge ${s.priority === 'required' ? 'fail' : 'blocked'}`}>{s.priority}</span>
                      {s.categoryLabel && (
                        <span style={{ fontSize: '0.75rem', color: 'var(--muted)', marginRight: '0.35rem' }}>
                          {s.categoryLabel} ·
                        </span>
                      )}
                      {s.title}{' '}
                      {s.checkId && <code style={{ fontSize: '0.75rem' }}>{s.checkId}</code>}
                      <div style={{ color: 'var(--muted)', fontSize: '0.8rem' }}>{s.rationale}</div>
                    </li>
                  ))}
                </ol>
              </div>
            ),
          )}
        </div>
      )}

      <div className="card">
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>A. Action summary</h2>
        <p><strong>Gate:</strong> {rf.actionSummary.gate}</p>
        <p style={{ fontSize: '0.9rem', color: 'var(--muted)' }}>{rf.actionSummary.headline}</p>
        {rf.actionSummary.runCompletion.honestHealthNote && (
          <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{rf.actionSummary.runCompletion.honestHealthNote}</p>
        )}
        {rf.actionSummary.workflowsBlocked.length > 0 && (
          <p><strong>Blocked workflows:</strong> {rf.actionSummary.workflowsBlocked.map((w) => w.checkId).join(', ')}</p>
        )}
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
          {rf.aiAnalysis.disclaimer && (
            <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>{rf.aiAnalysis.disclaimer}</p>
          )}
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
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Application issues ({appCards.length}) vs scanner execution failures ({execCards.length}). Prompt buttons generate
          repair instructions only — they do not apply fixes automatically.
        </p>
        {rf.failureGroups?.length > 0 && (
          <details style={{ fontSize: '0.85rem', marginBottom: '0.5rem' }}>
            <summary>Grouped symptoms ({rf.failureGroups.length} group(s))</summary>
            <ul>
              {rf.failureGroups.map((g) => (
                <li key={g.groupKey}>
                  {g.title} — {g.uniqueIssueCount} finding(s), {g.occurrenceTotal} occurrence(s)
                </li>
              ))}
            </ul>
          </details>
        )}
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '0.75rem', alignItems: 'center' }}>
          <label>
            Show{' '}
            <select value={issueKind} onChange={(e) => setIssueKind(e.target.value)}>
              <option value="application">Application issues</option>
              <option value="execution">Scanner / execution</option>
              <option value="all">All failures</option>
            </select>
          </label>
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
          <button
            type="button"
            className="primary"
            onClick={() => openRepairPrompt(filtered.map((c) => c.findingId), 'All open issues (filtered)')}
          >
            Cursor prompt — filtered ({filtered.length})
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
              <p style={{ fontSize: '0.85rem', margin: '0.35rem 0' }}>{c.plainLanguageFailure}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Where:</strong> {c.page} · {c.browserDevice !== 'Not available for this report' ? c.browserDevice : 'viewport default'}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Expected:</strong> {c.expected}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Actual:</strong> {c.actual}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Impact:</strong> {c.userImpact} — {c.severityRationale}</p>
              <p style={{ fontSize: '0.85rem' }}><strong>Fix:</strong> {c.recommendedFix}</p>
              <p style={{ fontSize: '0.8rem', color: 'var(--muted)' }}>
                {c.cause.label}: {c.cause.text}
                {c.requiresSourceInspection && ' (confirm in source — paths not inferred from URL scan)'}
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
        <h2 style={{ marginTop: 0, fontSize: '1.15rem' }}>C. Changes vs baseline</h2>
        <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>
          Compare with a prior run on the same URL and packs. Verified fixed only when scope is comparable and the check
          passed on re-run.
        </p>
        <label style={{ fontSize: '0.85rem', display: 'block', marginBottom: '0.5rem' }}>
          Baseline run{' '}
          <select
            value={baselineRunId ?? changes?.baselineRunId ?? ''}
            onChange={(e) => setBaselineRunId(e.target.value || null)}
            style={{ minWidth: '18rem', maxWidth: '100%' }}
          >
            <option value="">— select comparable run —</option>
            {(rf.comparableBaselines ?? []).map((b) => (
              <option key={b.runId} value={b.runId}>
                {b.runId.slice(-12)} · {b.comparability?.comparable ? 'comparable' : b.comparability?.partial ? 'approximate' : 'limited'} ·{' '}
                {b.generatedAt?.slice(0, 10) ?? '?'}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          Or paste run ID{' '}
          <input
            type="text"
            value={baselineRunId ?? ''}
            onChange={(e) => setBaselineRunId(e.target.value.trim() || null)}
            placeholder="run_…"
            style={{ minWidth: '14rem' }}
          />
        </label>
        {!changes?.available ? (
          <p>{changes?.message}</p>
        ) : (
          <>
            {changes.notComparable && (
              <p style={{ color: 'var(--warn, orange)' }}>
                Comparison not fully comparable: {changes.comparabilityIssues?.join('; ')}
              </p>
            )}
            {changes.verificationPolicy?.note && (
              <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{changes.verificationPolicy.note}</p>
            )}
            <p>
              Baseline: <Link to={`/reports/${changes.baselineRunId}`}>{changes.baselineRunId}</Link>
            </p>
            <ChangeList
              title="Verified fixed"
              items={changes.verifiedFixed}
              renderItem={(row) => (
                <li key={row.identityKey}>
                  <code>{row.checkId}</code> — {row.title}
                  {row.verificationLevel === 'approximate' && (
                    <span style={{ color: 'var(--warn, orange)' }}> (approximate scope)</span>
                  )}
                </li>
              )}
            />
            <ChangeList
              title="Possibly fixed (unverified scope)"
              items={changes.possiblyFixed}
              renderItem={(row) => (
                <li key={row.identityKey}>
                  <code>{row.checkId}</code> — {row.title}
                  {row.reason && <span style={{ color: 'var(--muted)' }}> — {row.reason}</span>}
                </li>
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
        <h4>What was not checked ({rf.coverageAndLimitations.gapsTotal ?? 0})</h4>
        <ul style={{ fontSize: '0.85rem' }}>
          {(rf.coverageAndLimitations.gaps ?? []).slice(0, gapLimit).map((g) => (
            <li key={`${g.kind}-${g.checkId}`} style={{ marginBottom: '0.35rem' }}>
              <strong>{g.title}</strong> ({g.kind})
              <div style={{ color: 'var(--muted)' }}>Why: {g.why}</div>
              <div style={{ color: 'var(--muted)' }}>Unknown: {g.unknown}</div>
              <div>Next: {g.enable}</div>
            </li>
          ))}
        </ul>
        {(rf.coverageAndLimitations.gaps?.length ?? 0) > gapLimit && (
          <button type="button" onClick={() => setGapLimit((n) => n + 20)}>
            Show more gaps ({rf.coverageAndLimitations.gaps.length - gapLimit} remaining)
          </button>
        )}
        <h4>Tools not run</h4>
        <ul style={{ fontSize: '0.85rem' }}>
          {rf.coverageAndLimitations.toolsUnavailable.map((t) => (
            <li key={t.tool}>{t.tool}: {t.executedReason ?? t.configuredReason}</li>
          ))}
        </ul>
        {rf.coverageAndLimitations.honestyNote && (
          <p style={{ fontSize: '0.85rem', color: 'var(--muted)' }}>{rf.coverageAndLimitations.honestyNote}</p>
        )}
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
