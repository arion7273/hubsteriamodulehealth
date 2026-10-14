import cron from 'node-cron';
import { loadRegistry } from './storage.mjs';
import { enqueueRun } from './run-queue.mjs';

const tasks = [];
const lastScheduled = new Map();

export function startScheduler() {
  stopScheduler();
  const registry = loadRegistry();
  for (const app of registry.apps) {
    if (!app.schedules?.enabled) continue;
    const env = app.environments?.find((e) => e.baseUrl);
    if (!env?.baseUrl) continue;

    const cronExpr = app.schedules.dailyHealthCron ?? '0 7 * * *';
    const task = cron.schedule(
      cronExpr,
      () => {
        const key = `${app.id}:daily`;
        const now = Date.now();
        const last = lastScheduled.get(key) ?? 0;
        if (now - last < 60_000) return;
        lastScheduled.set(key, now);
        enqueueRun({
          appId: app.id,
          environment: env.id,
          levels: [1],
          inputMode: 'url',
          scheduled: true,
        });
      },
      { timezone: registry.global?.timezone ?? 'America/New_York', scheduled: false },
    );
    task.start();
    tasks.push(task);
  }
}

export function stopScheduler() {
  for (const t of tasks) t.stop();
  tasks.length = 0;
}

export function scheduleStatus() {
  const registry = loadRegistry();
  return registry.apps.map((app) => ({
    appId: app.id,
    enabled: !!app.schedules?.enabled,
    dailyHealthCron: app.schedules?.dailyHealthCron ?? null,
    note: app.schedules?.enabled
      ? 'Active when baseUrl is configured for an environment'
      : 'Disabled until targets and accounts are configured',
  }));
}
