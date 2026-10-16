import { useEffect, useState } from 'react';
import { api, checkApiHealth } from '../api.js';
import bundledRegistry from '@registry/apps.json';

export function useRegistry() {
  const [registry, setRegistry] = useState(bundledRegistry);
  const [apiOnline, setApiOnline] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const online = await checkApiHealth();
        if (!cancelled && online) setApiOnline(true);
        const full = await api('/api/registry');
        if (!cancelled) {
          setRegistry(full);
          setApiOnline(true);
        }
      } catch {
        if (!cancelled) {
          setRegistry(bundledRegistry);
          setApiOnline(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { registry, apps: registry.apps ?? [], apiOnline };
}
