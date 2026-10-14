import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Schedules() {
  const [data, setData] = useState(null);

  useEffect(() => {
    api('/api/schedules').then(setData);
  }, []);

  return (
    <div>
      <h2>Schedules</h2>
      <p style={{ color: 'var(--muted)' }}>
        Timezone: {data?.timezone}. Schedules stay disabled until targets and accounts are configured.
      </p>
      <div className="card">
        {(data?.schedules ?? []).map((s) => (
          <div key={s.appId} style={{ marginBottom: '1rem' }}>
            <strong>{s.appId}</strong> — {s.enabled ? 'enabled' : 'disabled'}
            <br />
            <span style={{ color: 'var(--muted)', fontSize: '0.9rem' }}>{s.note}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
