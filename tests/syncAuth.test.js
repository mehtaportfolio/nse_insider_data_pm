import test from 'node:test';
import assert from 'node:assert/strict';

import { isAuthorizedSyncRequest } from '../src/utils/syncAuth.js';

test('allows requests when the provided key matches the configured secret', () => {
  const req = { query: { key: 'top-secret' } };
  assert.equal(isAuthorizedSyncRequest(req, 'top-secret'), true);
});

test('rejects requests when the provided key is missing or incorrect', () => {
  assert.equal(isAuthorizedSyncRequest({ query: {} }, 'top-secret'), false);
  assert.equal(isAuthorizedSyncRequest({ body: { key: 'wrong' } }, 'top-secret'), false);
});
