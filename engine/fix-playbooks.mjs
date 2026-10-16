/**
 * Actionable fix guidance per check — used in QA audit markdown and Cursor prompts.
 */

const AXE_COLOR_CONTRAST = {
  acceptanceCriteria: [
    'axe `color-contrast` passes on the Module Health entry URL with zero violations for this rule.',
    'Normal text ≥ 4.5:1 contrast; large text (18px+ or 14px+ bold) ≥ 3:1 against its background.',
  ],
  steps: [
    'In DevTools, inspect each selector in evidence; note computed `color` and `background-color`.',
    'Prefer fixing **design tokens** (CSS variables / Tailwind theme) for `.eyebrow`, muted text, and badge classes (e.g. `.w`) rather than one-off overrides.',
    'Check hero, timeline (`time`, `b`), CTAs, and footer links — marketing pages often fail on soft gray-on-white.',
    'After CSS changes, deploy and re-run the same URL scan (quick-health + ui-a11y packs).',
  ],
  likelyFiles: [
    'Global/marketing styles (e.g. `app/globals.css`, `styles/marketing.css`, or layout wrapper for the landing page).',
    'Component CSS for hero, sticky CTA, and section headings referenced in evidence.',
  ],
};

const AXE_REGION = {
  acceptanceCriteria: [
    'axe `region` passes — no content outside landmarks on the scanned view.',
    'Exactly one visible `<main>` (or `role="main"`) contains primary page content.',
  ],
  steps: [
    'Find nodes outside landmarks (often a sticky promo bar). Evidence may show `#stk` or similar fixed/sticky siblings of `<main>`.',
    'Either move the sticky bar inside `<header>` / `<footer>` or wrap the page in a landmark structure: `header` + `main` + `footer`.',
    'Avoid leaving interactive content as a direct child of `<body>` without a landmark role.',
    'Re-run axe on the production URL after deploy.',
  ],
  likelyFiles: [
    'Root layout / page shell (e.g. `app/layout.tsx`, `pages/_app.tsx`, or marketing `index` template).',
    'Sticky CTA component if `#stk` or similar appears in evidence.',
  ],
};

const RUNNER_PLAYWRIGHT_HOST = {
  acceptanceCriteria: [
    'Module Health runner can launch Chromium (no `playwright-live.crash` / `axe-core.crash`).',
    'Re-run the same URL scan from the machine that hosts `npm start` — not a fix in the scanned site’s app repo.',
  ],
  steps: [
    'On the **Module Health host** (this repo), run: `npx playwright install chromium`',
    'Restart the server: `npm start` (or redeploy the scan worker).',
    'Confirm Chromium launches (e.g. run checkPlaywrightBrowsers from engine/playwright-preflight.mjs or GET /api/health → playwright: ready).',
    'Re-run the URL QA audit preset (quick-health + ui-a11y) against the same URL.',
  ],
  likelyFiles: [
    'Not applicable — environment setup on the scan runner, not hubsteriacare.com source.',
  ],
};

const BY_CHECK_ID = {
  'axe.rule.color-contrast': AXE_COLOR_CONTRAST,
  'axe.rule.region': AXE_REGION,
  'playwright-live.crash': RUNNER_PLAYWRIGHT_HOST,
  'axe-core.crash': RUNNER_PLAYWRIGHT_HOST,
};

/**
 * @param {object} finding
 * @returns {{ acceptanceCriteria: string[], steps: string[], likelyFiles: string[], verifyCheckId: string }}
 */
export function getFixPlaybook(finding) {
  const checkId = finding?.checkId ?? '';
  const actual = String(finding?.actual ?? '');
  if (
    (checkId.endsWith('.crash') || checkId.endsWith('.preflight')) &&
    /Executable doesn't exist|playwright install/i.test(actual)
  ) {
    return { ...RUNNER_PLAYWRIGHT_HOST, verifyCheckId: checkId };
  }
  const base = BY_CHECK_ID[checkId] ?? {
    acceptanceCriteria: [
      `Module Health check \`${checkId}\` passes on re-run with the same scope.`,
      finding?.expected ? `Expected: ${finding.expected}` : 'Restore expected behavior per check title.',
    ],
    steps: finding?.remediation?.steps?.length
      ? finding.remediation.steps
      : [finding?.remediation?.summary ?? 'Investigate actual vs expected and fix in the owning repo.'],
    likelyFiles: ['Locate the route or module that serves the URL under test.'],
  };

  return {
    ...base,
    verifyCheckId: checkId,
  };
}

/**
 * @param {object} finding
 */
export function formatPlaybookMarkdown(finding, index) {
  const pb = getFixPlaybook(finding);
  const lines = [
    `### ${index}. [${finding.severity ?? 'medium'}] \`${finding.checkId}\``,
    '',
    `**${finding.title}**`,
    '',
    finding.suspectedCause ? `**Why it matters:** ${finding.suspectedCause}` : null,
    finding.actual ? `**Observed:** ${finding.actual}` : null,
    '',
    '**How to fix:**',
    ...pb.steps.map((s) => `- ${s}`),
    '',
    '**Where to look (typical):**',
    ...pb.likelyFiles.map((s) => `- ${s}`),
    '',
    '**Done when:**',
    ...pb.acceptanceCriteria.map((s) => `- ${s}`),
  ].filter(Boolean);

  const evidence = finding.evidence ?? [];
  if (evidence.length) {
    lines.push('', '**Evidence samples:**');
    for (const e of evidence.slice(0, 8)) {
      if (e.value) lines.push(`- \`${e.value}\`${e.html ? ` — ${e.html}` : ''}`);
    }
  }

  return lines.join('\n');
}
