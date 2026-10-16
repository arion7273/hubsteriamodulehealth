import fs from 'node:fs';
import path from 'node:path';
import { openBrowserSession, createInstrumentedPage } from '../browser-session.mjs';
import { createFinding } from '../findings.mjs';
import { validateWorkflowRecipe } from './recipe-schema.mjs';
import { buildTestData, interpolateString } from './interpolate.mjs';

/**
 * @param {object} params
 * @param {object} params.recipe
 * @param {object} params.ctx - appId, environment, runId, targetUrl, role, variant
 * @param {string} params.workflowId
 * @param {string} [params.requirementId]
 */
export async function executeWorkflowRecipe(params) {
  const { recipe, ctx, workflowId, requirementId } = params;
  const validation = validateWorkflowRecipe(recipe);
  if (!validation.ok) {
    return {
      ok: false,
      findings: [
        findingFromStep({
          workflowId,
          stepIndex: -1,
          status: 'blocked',
          title: 'Invalid workflow recipe',
          actual: validation.errors.join('; '),
          ctx,
          requirementId,
        }),
      ],
    };
  }

  const baseUrl = (ctx.targetUrl ?? '').replace(/\/$/, '');
  const testData = buildTestData(recipe, { ...ctx, baseUrl });
  const interpCtx = { ...ctx, baseUrl, testData, variant: ctx.variant ?? recipe.variant ?? 'fixed' };
  const findings = [];
  const stepEvidence = [];
  const artifactDir = path.join(process.cwd(), 'data', 'artifacts', ctx.runId ?? 'workflow', workflowId);
  fs.mkdirSync(artifactDir, { recursive: true });

  const { browser, context } = await openBrowserSession({ headless: ctx.headless ?? true });
  const { page } = await createInstrumentedPage(context, baseUrl ? new URL(baseUrl).origin : null);

  try {
    for (const step of recipe.setup ?? []) {
      await runStep(page, context, step, interpCtx, -1, artifactDir, findings, workflowId, requirementId, true);
    }

    for (let i = 0; i < recipe.steps.length; i++) {
      const step = recipe.steps[i];
      const stepOk = await runStep(page, context, step, interpCtx, i, artifactDir, findings, workflowId, requirementId, false);
      if (!stepOk) break;
    }

    for (const step of recipe.cleanup ?? []) {
      await runStep(page, context, step, interpCtx, recipe.steps.length, artifactDir, findings, workflowId, requirementId, true);
    }
  } finally {
    await browser.close();
  }

  const failed = findings.some((f) => f.status === 'fail');
  const summaryStatus = failed ? 'fail' : 'pass';
  findings.push(
    createFinding({
      checkId: `l3.workflow.${workflowId}.summary`,
      appId: ctx.appId,
      environment: ctx.environment,
      level: 3,
      status: summaryStatus,
      severity: failed ? 'high' : 'info',
      title: `Workflow ${recipe.label ?? workflowId}: ${summaryStatus === 'pass' ? 'completed' : 'failed'}`,
      expected: recipe.successCriteria ?? 'All steps pass with asserted outcomes',
      actual: failed ? 'One or more steps failed — see step findings' : 'All steps passed',
      evidence: stepEvidence,
      meta: {
        tool: 'workflow-executor',
        workflowId,
        requirementId,
        variant: interpCtx.variant,
        recipeId: recipe.id,
      },
      scannerFinding: false,
      verifiedObservation: true,
    }),
  );

  return { ok: !failed, findings };
}

async function runStep(page, context, step, ctx, index, artifactDir, findings, workflowId, requirementId, isAux) {
  const type = step.type;
  const started = Date.now();
  let ok = true;
  let actual = '';
  let expected = step.expected ?? step.title ?? type;

  try {
    switch (type) {
      case 'clearStorage': {
        const storageType = step.storage ?? 'local';
        await context.addInitScript((st) => {
          try {
            const flag = `__wf_cleared_${st}`;
            if (sessionStorage.getItem(flag)) return;
            sessionStorage.setItem(flag, '1');
            if (st === 'local') localStorage.clear();
            else sessionStorage.clear();
          } catch {
            /* ignore */
          }
        }, storageType);
        actual = `Scheduled ${storageType} storage clear on next document`;
        break;
      }
      case 'setRole':
        await page.evaluate((role) => {
          sessionStorage.setItem('wf-role', role);
        }, interpolateString(step.role ?? ctx.role, ctx));
        actual = `Role set to ${step.role}`;
        break;
      case 'navigate':
        await page.goto(interpolateString(step.url, ctx), {
          waitUntil: 'domcontentloaded',
          timeout: step.timeoutMs ?? 30000,
        });
        actual = page.url();
        expected = interpolateString(step.url, ctx);
        break;
      case 'click':
        await page.click(step.selector, { timeout: step.timeoutMs ?? 15000 });
        actual = `Clicked ${step.selector}`;
        if (step.assertAfter === 'navigation') {
          await page.waitForLoadState('domcontentloaded', { timeout: step.timeoutMs ?? 15000 });
        }
        break;
      case 'fill':
        await page.fill(step.selector, interpolateString(step.value, ctx), { timeout: step.timeoutMs ?? 15000 });
        actual = `Filled ${step.selector}`;
        break;
      case 'press':
        await page.press(step.selector, step.key, { timeout: step.timeoutMs ?? 15000 });
        actual = `Pressed ${step.key} on ${step.selector}`;
        break;
      case 'waitFor':
        await page.waitForSelector(step.selector, {
          state: step.state ?? 'visible',
          timeout: step.timeoutMs ?? 15000,
        });
        actual = `Selector ${step.selector} is ${step.state ?? 'visible'}`;
        break;
      case 'assertVisible': {
        const el = page.locator(step.selector);
        await el.waitFor({ state: 'visible', timeout: step.timeoutMs ?? 10000 });
        const text = (await el.innerText()).trim();
        if (step.textContains && !text.includes(interpolateString(step.textContains, ctx))) {
          throw new Error(`Expected text containing "${step.textContains}", got "${text.slice(0, 120)}"`);
        }
        actual = text.slice(0, 200);
        expected = step.textContains ? `visible with "${step.textContains}"` : 'visible';
        break;
      }
      case 'assertHidden':
        await page.waitForSelector(step.selector, { state: 'hidden', timeout: step.timeoutMs ?? 10000 });
        actual = 'hidden';
        break;
      case 'assertUrl': {
        const url = page.url();
        const pattern = interpolateString(step.pattern ?? step.url, ctx);
        if (pattern.startsWith('regex:')) {
          const re = new RegExp(pattern.slice(6));
          if (!re.test(url)) throw new Error(`URL ${url} does not match ${pattern}`);
        } else if (!url.includes(pattern)) {
          throw new Error(`URL ${url} does not include ${pattern}`);
        }
        actual = url;
        expected = pattern;
        break;
      }
      case 'assertValue': {
        const val = await page.inputValue(step.selector);
        const want = interpolateString(step.equals ?? step.value, ctx);
        if (val !== want) throw new Error(`Expected value "${want}", got "${val}"`);
        actual = val;
        expected = want;
        break;
      }
      case 'assertText': {
        const text = (await page.locator(step.selector).innerText()).trim();
        const want = interpolateString(step.equals, ctx);
        if (text !== want) throw new Error(`Expected "${want}", got "${text}"`);
        actual = text;
        expected = want;
        break;
      }
      case 'assertPersisted': {
        const key = step.key;
        const storage = step.storage ?? 'local';
        const val = await page.evaluate(
          ({ storage, key }) => (storage === 'local' ? localStorage.getItem(key) : sessionStorage.getItem(key)),
          { storage, key },
        );
        const want = interpolateString(step.equals, ctx);
        if ((val ?? '') !== want) throw new Error(`Persisted ${key} expected "${want}", got "${val ?? ''}"`);
        actual = val;
        expected = want;
        break;
      }
      case 'assertNetwork': {
        const pattern = interpolateString(step.urlPattern, ctx);
        const resp = await page.waitForResponse(
          (r) => r.url().includes(pattern) && (!step.status || r.status() === step.status),
          { timeout: step.timeoutMs ?? 15000 },
        );
        actual = `${resp.status()} ${resp.url()}`;
        expected = `${step.status ?? 'any'} for ${pattern}`;
        break;
      }
      case 'screenshot': {
        const file = path.join(artifactDir, `step-${index}-${type}.png`);
        await page.screenshot({ path: file, fullPage: step.fullPage ?? false });
        actual = file;
        break;
      }
      default:
        throw new Error(`Unsupported step type: ${type}`);
    }
  } catch (e) {
    ok = false;
    actual = String(e?.message ?? e);
    try {
      const failShot = path.join(artifactDir, `fail-step-${index}.png`);
      await page.screenshot({ path: failShot, fullPage: true });
      findings.push(
        findingFromStep({
          workflowId,
          stepIndex: index,
          status: 'fail',
          title: step.title ?? `Step ${index + 1}: ${type}`,
          expected,
          actual,
          ctx,
          requirementId,
          evidence: [{ type: 'screenshot', path: failShot }, { type: 'step', step: type, index }],
          durationMs: Date.now() - started,
        }),
      );
      return false;
    } catch {
      findings.push(
        findingFromStep({
          workflowId,
          stepIndex: index,
          status: 'fail',
          title: step.title ?? `Step ${index + 1}: ${type}`,
          expected,
          actual,
          ctx,
          requirementId,
          durationMs: Date.now() - started,
        }),
      );
      return false;
    }
  }

  if (!isAux) {
    findings.push(
      findingFromStep({
        workflowId,
        stepIndex: index,
        status: 'pass',
        title: step.title ?? `Step ${index + 1}: ${type}`,
        expected,
        actual,
        ctx,
        requirementId,
        durationMs: Date.now() - started,
      }),
    );
  }
  return ok;
}

function findingFromStep(p) {
  const idx = p.stepIndex;
  const checkId =
    idx < 0 ? `l3.workflow.${p.workflowId}.setup` : `l3.workflow.${p.workflowId}.step.${idx + 1}`;
  return createFinding({
    checkId,
    appId: p.ctx.appId,
    environment: p.ctx.environment,
    level: 3,
    status: p.status,
    severity: p.status === 'fail' ? 'high' : 'info',
    title: p.title,
    expected: p.expected ?? null,
    actual: p.actual ?? null,
    evidence: p.evidence ?? [],
    durationMs: p.durationMs ?? null,
    meta: {
      tool: 'workflow-executor',
      workflowId: p.workflowId,
      workflowStep: idx,
      requirementId: p.requirementId ?? null,
      variant: p.ctx.variant,
      gapClass: p.status === 'fail' ? 'confirmed_defect' : p.status === 'pass' ? 'requirement_met' : null,
    },
    userImpact:
      p.status === 'fail'
        ? 'Workflow gap — user may see broken save, validation, or permission behavior.'
        : null,
    remediation:
      p.status === 'fail'
        ? { summary: 'Fix application workflow per expected behavior manifest and re-run L3 workflow pack.' }
        : null,
    scannerFinding: false,
    verifiedObservation: p.status === 'pass',
  });
}
