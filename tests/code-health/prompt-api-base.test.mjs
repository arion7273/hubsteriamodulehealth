import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePromptApiBase } from '../../server/prompt-api-base.mjs';

test('resolvePromptApiBase prefers moduleHealthApiBase then uiOrigin then fallback', () => {
  const req = {};
  const fallback = () => 'https://fallback.example';
  assert.equal(
    resolvePromptApiBase(req, { moduleHealthApiBase: 'https://mh/' }, fallback),
    'https://mh',
  );
  assert.equal(resolvePromptApiBase(req, { uiOrigin: 'https://ui/' }, fallback), 'https://ui');
  assert.equal(resolvePromptApiBase(req, {}, fallback), 'https://fallback.example');
});
