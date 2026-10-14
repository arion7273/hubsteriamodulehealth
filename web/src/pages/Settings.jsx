import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Settings() {
  const [apps, setApps] = useState([]);
  const [appId, setAppId] = useState('defect-fixture');
  const [settings, setSettings] = useState(null);
  const [newApp, setNewApp] = useState({ name: '', url: '' });

  useEffect(() => {
    api('/api/registry').then((reg) => setApps(reg.apps));
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

  if (!settings) return <p>Loading…</p>;

  return (
    <div className="stack">
      <h2>Module tester settings</h2>
      <div className="card stack">
        <label>App</label>
        <select value={appId} onChange={(e) => setAppId(e.target.value)}>
          {apps.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
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
        <label>
          <input
            type="checkbox"
            checked={settings.schedule?.enabled ?? false}
            onChange={(e) => setSettings({ ...settings, schedule: { ...settings.schedule, enabled: e.target.checked } })}
          />
          Enable schedule (requires app registry schedules + base URL)
        </label>
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
