import test from 'node:test';
import assert from 'node:assert/strict';

import { authOptions } from './auth.js';
import { hasCustomerDashboardAccess } from './features/auth/access.js';
import { createErpPasswordHash } from './features/erp/password.js';

test('auth options expose Google login and one dedicated CEO credentials provider', () => {
  const providerIds = authOptions.providers.map((provider) => provider.id);
  assert.ok(providerIds.includes('credentials'), 'CEO credentials provider must be available');
  assert.equal(providerIds.filter((providerId) => providerId === 'credentials').length, 1);
  assert.ok(providerIds.every((providerId) => ['google', 'credentials'].includes(providerId)));
});

test('only Google sessions can access the customer dashboard', async () => {
  const jwtCallback = authOptions.callbacks.jwt;
  const googleToken = await jwtCallback({
    token: {},
    account: { provider: 'google' },
    user: { id: 'google-customer', email: 'customer@example.com' },
  });
  const erpToken = await jwtCallback({
    token: {},
    account: { provider: 'credentials' },
    user: { id: 'ceo', username: 'ceo.owner' },
  });

  assert.equal(hasCustomerDashboardAccess(googleToken), true);
  assert.equal(hasCustomerDashboardAccess(erpToken), false);
  assert.equal(hasCustomerDashboardAccess({ authProvider: 'unknown' }), false);
});

test('ERP credentials provider authenticates only the configured CEO account', async () => {
  const provider = authOptions.providers.find(({ id }) => id === 'credentials');
  const originalUsername = process.env.ERP_CEO_USERNAME;
  const originalHash = process.env.ERP_CEO_PASSWORD_HASH;
  const password = 'Test-only-CEO-password-2026';
  process.env.ERP_CEO_USERNAME = 'ceo.owner';
  process.env.ERP_CEO_PASSWORD_HASH = await createErpPasswordHash(password);

  try {
    assert.deepEqual(
      await provider.options.authorize({ username: 'CEO.Owner', password }),
      { id: 'ceo.owner', username: 'ceo.owner', name: 'CEO' },
    );
    assert.equal(await provider.options.authorize({ username: 'other-user', password }), null);
    assert.equal(await provider.options.authorize({ username: 'ceo.owner', password: 'incorrect-password' }), null);
  } finally {
    if (originalUsername === undefined) delete process.env.ERP_CEO_USERNAME;
    else process.env.ERP_CEO_USERNAME = originalUsername;
    if (originalHash === undefined) delete process.env.ERP_CEO_PASSWORD_HASH;
    else process.env.ERP_CEO_PASSWORD_HASH = originalHash;
  }
});
