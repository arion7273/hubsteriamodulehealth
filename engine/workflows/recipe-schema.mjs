const STEP_TYPES = new Set([
  'navigate',
  'click',
  'fill',
  'press',
  'waitFor',
  'assertVisible',
  'assertHidden',
  'assertUrl',
  'assertValue',
  'assertPersisted',
  'assertText',
  'assertNetwork',
  'clearStorage',
  'setRole',
  'screenshot',
]);

/**
 * @param {object} recipe
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateWorkflowRecipe(recipe) {
  const errors = [];
  if (!recipe?.id) errors.push('recipe.id required');
  if (!recipe?.version) errors.push('recipe.version required');
  if (!Array.isArray(recipe.steps) || recipe.steps.length === 0) {
    errors.push('recipe.steps must be a non-empty array');
  }
  for (let i = 0; i < (recipe.steps?.length ?? 0); i++) {
    const step = recipe.steps[i];
    if (!step?.type) errors.push(`step ${i}: type required`);
    else if (!STEP_TYPES.has(step.type)) errors.push(`step ${i}: unknown type ${step.type}`);
    if (step.type === 'navigate' && !step.url) errors.push(`step ${i}: navigate requires url`);
    if (['click', 'fill', 'assertVisible', 'assertValue', 'waitFor'].includes(step.type) && !step.selector) {
      errors.push(`step ${i}: ${step.type} requires selector`);
    }
    if (step.type === 'fill' && step.value == null) errors.push(`step ${i}: fill requires value`);
  }
  if (recipe.exec) errors.push('recipe must not contain exec or arbitrary code fields');
  return { ok: errors.length === 0, errors };
}

export { STEP_TYPES };
