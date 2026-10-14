import { createFinding } from '../findings.mjs';

/**
 * @param {object} ctx
 */
export async function runLevel5Resilience(ctx) {
  const { app, environment } = ctx;
  const env = app.environments?.find((e) => e.id === environment);
  if (environment === 'production' || env?.id === 'production') {
    return [
      createFinding({
        checkId: 'l5.policy.production',
        appId: app.id,
        environment,
        level: 5,
        status: 'blocked',
        severity: 'info',
        title: 'Load/resilience tests blocked on production',
        remediation: { summary: 'Use approved staging with explicit configuration.' },
      }),
    ];
  }
  return [
    createFinding({
      checkId: 'l5.runner',
      appId: app.id,
      environment,
      level: 5,
      status: 'not_started',
      severity: 'info',
      title: 'Resilience and bounded load runner',
      actual: 'Phase D — requires isolated worker, concurrency caps, and emergency stop.',
    }),
  ];
}
