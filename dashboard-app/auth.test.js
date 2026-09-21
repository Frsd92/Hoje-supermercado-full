import test from 'node:test';
import assert from 'node:assert/strict';

import { authOptions } from './auth.js';

test('auth options must expose only Google login', () => {
  const providerIds = authOptions.providers.map((provider) => provider.id);
  assert.ok(!providerIds.includes('credentials'), 'Credentials provider must not be available');
  assert.ok(providerIds.every((providerId) => providerId === 'google'), 'Only Google provider should be available');
});
