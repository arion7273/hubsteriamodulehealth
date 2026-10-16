import { buildFindingCard } from './finding-card-model.mjs';
import { classifyFindingOutcome } from './finding-classify.mjs';

/**
 * Group related failure symptoms while preserving each finding ID.
 * @param {object} report
 */
export function buildFailureGroups(report) {
  const fails = (report.findings ?? []).filter((f) => f.status === 'fail');
  const groups = new Map();

  for (const f of fails) {
    const kind = classifyFindingOutcome(f);
    const rule = f.checkId?.startsWith('axe.') ? f.checkId.split('.').slice(0, 3).join('.') : null;
    const key = f.dedupeKey ?? rule ?? `${kind}:${f.checkId}`;
    if (!groups.has(key)) {
      groups.set(key, {
        groupKey: key,
        kind,
        sharedCauseHint: f.suspectedCause ?? null,
        checkIds: new Set(),
        findingIds: [],
        occurrenceTotal: 0,
        cards: [],
      });
    }
    const g = groups.get(key);
    g.checkIds.add(f.checkId);
    g.findingIds.push(f.id);
    g.occurrenceTotal += f.occurrences ?? 1;
    g.cards.push(buildFindingCard(f, report));
    if (!g.sharedCauseHint && f.suspectedCause) g.sharedCauseHint = f.suspectedCause;
  }

  return [...groups.values()].map((g) => ({
    ...g,
    checkIds: [...g.checkIds],
    uniqueIssueCount: g.findingIds.length,
    title:
      g.cards.length === 1
        ? g.cards[0].title
        : `${g.cards[0].title} (+${g.cards.length - 1} related occurrence(s))`,
  }));
}
