import { useEffect, useMemo, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { api } from '../api.js';
import { useRegistry } from '../hooks/useRegistry.js';
const LEVELS = [
  { id: 1, label: 'Level 1 — Quick health' },
  { id: 2, label: 'Level 2 — Module check' },
  { id: 3, label: 'Level 3 — Connected workflow' },
  { id: 4, label: 'Level 4 — Quality & protection' },
  { id: 5, label: 'Level 5 — Resilience & load' },
];

export default function RunTest() {
  const [params] = useSearchParams();
  const { apps, apiOnline } = useRegistry();
  const [appId, setAppId] = useState(params.get('app') ?? 'adhoc-url-scan');
  const [environment, setEnvironment] = useState('custom');
  const [inputMode, setInputMode] = useState('url');
  const [targetUrl, setTargetUrl] = useState('');
  const [repoRoot, setRepoRoot] = useState('');
  const [html, setHtml] = useState('');
  const [levels, setLevels] = useState([1]);
  const [usePacks, setUsePacks] = useState(true);
  const [packCatalog, setPackCatalog] = useState([]);
  const [packNote, setPackNote] = useState('');
  const [selectedPacks, setSelectedPacks] = useState(['quick-health']);
  const [job, setJob] = useState(null);
  const [polling, setPolling] = useState(false);
  const [runError, setRunError] = useState('');

  const selectedApp = useMemo(() => apps.find((a) => a.id === appId), [apps, appId]);

  useEffect(() => {
    if (!apps.length) return;
    const app = apps.find((a) => a.id === appId);
    const env = app?.environments?.find((e) => e.id === environment);
    if (!targetUrl && env?.baseUrl) setTargetUrl(env.baseUrl);
    if (!repoRoot && app?.repositoryPath) setRepoRoot(app.repositoryPath);
  }, [apps, appId, environment]);

  useEffect(() => {
    if (apiOnline !== true) return;
    api(`/api/packs?inputMode=${inputMode}`)
      .then((data) => {
        setPackCatalog(data.packs ?? []);
        setPackNote(data.note ?? '');
        setSelectedPacks((prev) => {
          const allowed = new Set((data.packs ?? []).map((p) => p.id));
          const kept = prev.filter((id) => allowed.has(id));
          return kept.length ? kept : [(data.packs ?? [])[0]?.id].filter(Boolean);
        });
      })
      .catch(() => setPackCatalog([]));
  }, [inputMode, apiOnline]);

  function toggleLevel(id) {
    setLevels((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id].sort()));
  }

  function togglePack(id) {
    setSelectedPacks((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function startRun() {
    setRunError('');
    if (apiOnline === false) {
      setRunError('Scan server is not connected. Deploy the API or set VITE_API_BASE (see banner above).');
      return;
    }
    if (inputMode === 'url' && !targetUrl?.trim()) {
      setRunError('Enter a target URL.');
      return;
    }
    if (inputMode === 'repository' && !repoRoot?.trim()) {
      setRunError('Enter a repository path on the runner.');
      return;
    }
    const effectiveAppId =
      appId && apps.some((a) => a.id === appId) ? appId : 'adhoc-url-scan';
    setPolling(true);
    try {
      const body = {
        appId: effectiveAppId,
        environment: effectiveAppId === 'adhoc-url-scan' ? 'custom' : environment,
        inputMode,
        targetUrl: inputMode === 'url' ? targetUrl.trim() : undefined,
        repoRoot: inputMode === 'repository' ? repoRoot.trim() : undefined,
        htmlSnapshot: inputMode === 'html' ? { html } : undefined,
      };
      if (usePacks && selectedPacks.length) {
        body.packs = selectedPacks;
      } else {
        body.levels = levels.length ? levels : [1];
      }
      const { runId } = await api('/api/runs', { method: 'POST', body: JSON.stringify(body) });
      setJob({ runId, status: 'queued' });
      const interval = setInterval(async () => {
        try {
          const j = await api(`/api/jobs/${runId}`);
          setJob(j);
          if (j.status === 'completed' || j.status === 'failed' || j.status === 'cancelled') {
            clearInterval(interval);
            setPolling(false);
            if (j.status === 'failed') setRunError(j.message || j.error || 'Run failed');
          }
        } catch (e) {
          clearInterval(interval);
          setPolling(false);
          setRunError(e.message);
        }
      }, 500);
    } catch (e) {
      setPolling(false);
      setRunError(e.message || 'Could not start run');
    }
  }

  async function cancel() {
    if (!job?.runId) return;
    await api(`/api/runs/${job.runId}/cancel`, { method: 'POST' });
  }

  return (
    <div className="stack">
      <h2>Run test</h2>
      <p style={{ color: 'var(--muted)' }}>
        Choose app → input mode → test packs (recommended) or legacy levels. URL/HTML exercises the live or
        snapshot UI; repository mode runs lint, typecheck, tests, and security scanners on a connected checkout —
        neither replaces the other.
      </p>

      <div className="card stack">
        <label>Application</label>
        <select value={appId} onChange={(e) => setAppId(e.target.value)}>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>

        <label>Environment</label>
        <select value={environment} onChange={(e) => setEnvironment(e.target.value)}>
          {(selectedApp?.environments ?? []).map((e) => (
            <option key={e.id} value={e.id}>{e.label}</option>
          ))}
        </select>

        <label>Input mode</label>
        <select value={inputMode} onChange={(e) => setInputMode(e.target.value)}>
          <option value="url">Live URL</option>
          <option value="html">HTML snapshot (isolated)</option>
          <option value="repository">Connected repository (runner checkout)</option>
        </select>

        {inputMode === 'url' ? (
          <>
            <label>Target URL</label>
            <input value={targetUrl} onChange={(e) => setTargetUrl(e.target.value)} style={{ width: '100%' }} />
          </>
        ) : inputMode === 'html' ? (
          <>
            <label>Paste HTML</label>
            <textarea rows={8} value={html} onChange={(e) => setHtml(e.target.value)} style={{ width: '100%' }} />
          </>
        ) : (
          <>
            <label>Repository path (on scan runner)</label>
            <input value={repoRoot} onChange={(e) => setRepoRoot(e.target.value)} style={{ width: '100%' }} />
            <p style={{ color: 'var(--muted)', fontSize: '0.85rem', margin: 0 }}>
              Example: {selectedApp?.repositoryPath ?? 'fixtures/sample-repo'}
            </p>
          </>
        )}

        <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <input type="checkbox" checked={usePacks} onChange={(e) => setUsePacks(e.target.checked)} />
          Use selectable test packs (engines)
        </label>

        {usePacks ? (
          <>
            {packNote && <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>{packNote}</p>}
            <label>Test packs</label>
            {packCatalog.map((p) => (
              <label key={p.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                <input
                  type="checkbox"
                  checked={selectedPacks.includes(p.id)}
                  onChange={() => togglePack(p.id)}
                />
                <span>
                  <strong>{p.label}</strong> — {p.description}
                </span>
              </label>
            ))}
          </>
        ) : (
          <>
            <label>Test levels (legacy)</label>
            {LEVELS.map((l) => (
              <label key={l.id} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="checkbox" checked={levels.includes(l.id)} onChange={() => toggleLevel(l.id)} />
                {l.label}
              </label>
            ))}
          </>
        )}

        {runError && (
          <p role="alert" style={{ color: '#fca5a5', margin: 0 }}>{runError}</p>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button className="primary" type="button" disabled={polling || apiOnline !== true} onClick={startRun}>
            Run
          </button>
          {job?.runId && polling && (
            <button type="button" onClick={cancel}>Cancel</button>
          )}
        </div>
      </div>

      {job && (
        <div className="card">
          <h3>Progress</h3>
          <p>Status: <span className={`badge ${job.status === 'completed' ? 'pass' : job.status === 'failed' ? 'fail' : 'blocked'}`}>{job.status}</span></p>
          <p>{job.message}</p>
          {job.status === 'completed' && (
            <Link to={`/reports/${job.runId}`}>View report →</Link>
          )}
        </div>
      )}
    </div>
  );
}
