import { useEffect, useState } from 'react';
import { api } from '../api.js';
import AppSelect from '../components/AppSelect.jsx';

export default function Settings() {
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState('defect-fixture');
  const [settings, setSettings] = useState(null);
  const [packDefs, setPackDefs] = useState([]);
  const [newApp, setNewApp] = useState({ name: '', url: '' });

  useEffect(() => {
    api('/api/registry').then((reg) => setApps(reg.apps));
    api('/api/packs?inputMode=url').then((d) => setPackDefs(d.packs ?? []));
  }, []);

  useEffect(() => {
    api(`/api/apps/${appId}/settings`).then(setSettings);
  }, [appId]);

  async function save() {
    await api(`/api/apps/${appId}/settings`, { method: 'PUT', body: JSON.stringify(settings) });
    alert('Settings saved.');
  }

  async function addApp() {
    await api('/api/apps', { method: 'POST', body: JSON.stringify(newApp) });
    const reg = await api('/api/registry');
    setApps(reg.apps);
    setNewApp({ name: '', url: '' });
  }

  function updatePack(packId, patch) {
    setSettings({
      ...settings,
      packs: {
        ...settings.packs,
        [packId]: { ...settings.packs?.[packId], ...patch },
      },
    });
  }

  if (!settings) return <p>Loading…</p>;

  const packIds = [...new Set([...Object.keys(settings.packs ?? {}), ...packDefs.map((p) => p.id)])];

  return (
    <div className="stack">
      <h2>Module tester settings</h2>
      <div className="card stack">
        <AppSelect apps={apps} value={appId} onChange={setAppId} label="App" />
        <label>Page limit</label>
        <input
          type="number"
          value={settings.budgets?.pageLimit ?? 15}
          onChange={(e) =>
            setSettings({ ...settings, budgets: { ...settings.budgets, pageLimit: Number(e.target.value) } })
          }
        />
        <label>Timeout (ms)</label>
        <input
          type="number"
          value={settings.budgets?.timeoutMs ?? 45000}
          onChange={(e) =>
            setSettings({ ...settings, budgets: { ...settings.budgets, timeoutMs: Number(e.target.value) } })
          }
        />
        <label>Evidence retention (days)</label>
        <input
          type="number"
          value={settings.evidenceRetentionDays ?? 30}
          onChange={(e) => setSettings({ ...settings, evidenceRetentionDays: Number(e.target.value) })}
        />
        <label>
          <input
            type="checkbox"
            checked={settings.schedule?.enabled ?? false}
            onChange={(e) => setSettings({ ...settings, schedule: { ...settings.schedule, enabled: e.target.checked } })}
          />
          Enable schedule (requires app registry schedules + base URL)
        </label>

        <h3>Test packs</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>
          Disable packs, set timeouts, and opt into advanced tools. URL/HTML runs never execute repository tools.
        </p>
        {packIds.map((id) => {
          const def = packDefs.find((p) => p.id === id);
          const pack = settings.packs?.[id] ?? { enabled: true };
          return (
            <div key={id} style={{ borderTop: '1px solid var(--border)', paddingTop: '0.5rem' }}>
              <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input
                  type="checkbox"
                  checked={pack.enabled !== false}
                  onChange={(e) => updatePack(id, { enabled: e.target.checked })}
                />
                <strong>{def?.label ?? id}</strong>
              </label>
              {def?.description && (
                <p style={{ fontSize: '0.8rem', color: 'var(--muted)', margin: '0.25rem 0' }}>{def.description}</p>
              )}
              {id === 'security' && (
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={pack.zapEnabled === true}
                    onChange={(e) => updatePack(id, { zapEnabled: e.target.checked })}
                  />
                  Enable ZAP passive (requires ZAP_API_URL on runner)
                </label>
              )}
              {id === 'load-recovery' && (
                <label style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginTop: '0.25rem' }}>
                  <input
                    type="checkbox"
                    checked={pack.k6Enabled === true}
                    onChange={(e) => updatePack(id, { k6Enabled: e.target.checked })}
                  />
                  Enable k6 load scenarios (staging only)
                </label>
              )}
            </div>
          );
        })}

        <button className="primary" type="button" onClick={save}>Save settings</button>
      </div>

      <div className="card">
        <h3>Cloud → cloud migration</h3>
        <p style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>
          Export registry overlays, settings, and run history from the API host with{' '}
          <code>npm run migrate:export</code>, import on the new host with{' '}
          <code>npm run migrate:import -- --merge</code>. Secrets are re-entered manually — see{' '}
          <code>docs/CLOUD_TO_CLOUD_MIGRATION.md</code> in the repo.
        </p>
      </div>

      <div className="card stack">
        <h3>Add application by URL</h3>
        <label>Name</label>
        <input value={newApp.name} onChange={(e) => setNewApp({ ...newApp, name: e.target.value })} />
        <label>Base URL</label>
        <input value={newApp.url} onChange={(e) => setNewApp({ ...newApp, url: e.target.value })} />
        <button type="button" onClick={addApp}>Add app</button>
      </div>
    </div>
  );
}
