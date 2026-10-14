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

        const rotation = app.schedules.packRotation ?? [];
        const dayIndex = new Date().getDay();
        const rotated = rotation.length ? rotation[dayIndex % rotation.length] : null;
        const packs = ['quick-health', ...(rotated ? [rotated] : [])];

        enqueueRun({
          appId: app.id,
          environment: env.id,
          inputMode: 'url',
          packs: app.schedules.usePacks ? packs : undefined,
          levels: app.schedules.usePacks ? undefined : [1],
          scheduled: true,
        });
      },
      { timezone: registry.global?.timezone ?? 'America/New_York', scheduled: false },
    );
    task.start();
    tasks.push(task);

    if (app.repositoryPath && app.schedules.weeklyRepoCron) {
      const repoTask = cron.schedule(
        app.schedules.weeklyRepoCron,
        () => {
          const key = `${app.id}:repo`;
          const now = Date.now();
          const last = lastScheduled.get(key) ?? 0;
          if (now - last < 60_000) return;
          lastScheduled.set(key, now);
          enqueueRun({
            appId: app.id,
            environment: env.id,
            inputMode: 'repository',
            repoRoot: app.repositoryPath,
            packs: ['code-quality', 'security'],
            scheduled: true,
          });
        },
        { timezone: registry.global?.timezone ?? 'America/New_York', scheduled: false },
      );
      repoTask.start();
      tasks.push(repoTask);
    }
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
    weeklyRepoCron: app.schedules?.weeklyRepoCron ?? null,
    packRotation: app.schedules?.packRotation ?? [],
    note: app.schedules?.enabled
      ? 'Daily quick-health; optional rotating packs and weekly repo scans when configured'
      : 'Disabled until targets and accounts are configured',
  }));
}
