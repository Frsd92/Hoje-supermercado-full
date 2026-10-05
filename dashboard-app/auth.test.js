import test from 'node:test';
import assert from 'node:assert/strict';

import { authOptions } from './auth.js';
import { hasCustomerDashboardAccess } from './features/auth/access.js';
import { createErpPasswordHash } from './features/erp/password.js';

test('auth options expose configured customer login providers and one CEO credentials provider', () => {
  const providerIds = authOptions.providers.map((provider) => provider.id);
  assert.ok(providerIds.includes('credentials'), 'CEO credentials provider must be available');
  assert.equal(providerIds.filter((providerId) => providerId === 'credentials').length, 1);
  assert.ok(providerIds.every((providerId) => ['google', 'apple', 'credentials'].includes(providerId)));
  assert.equal(
    providerIds.includes('apple'),
    Boolean(process.env.APPLE_CLIENT_ID && process.env.APPLE_CLIENT_SECRET),
  );
});

test('Google and Apple sessions can access the customer dashboard', async () => {
  const jwtCallback = authOptions.callbacks.jwt;
  const googleToken = await jwtCallback({
    token: {},
    account: { provider: 'google' },
    user: { id: 'google-customer', email: 'customer@example.com' },
  });
  const appleToken = await jwtCallback({
    token: {},
    account: { provider: 'apple' },
    user: { id: 'apple-customer', email: 'apple-customer@example.com' },
  });
  const erpToken = await jwtCallback({
    token: {},
    account: { provider: 'credentials' },
    user: { id: 'ceo', username: 'ceo.owner' },
  });

  assert.equal(hasCustomerDashboardAccess(googleToken), true);
  assert.equal(hasCustomerDashboardAccess(appleToken), true);
  assert.equal(hasCustomerDashboardAccess(erpToken), false);
  assert.equal(hasCustomerDashboardAccess({ authProvider: 'google', email: 'ceo@example.com', erpAccess: true }), false);
  assert.equal(hasCustomerDashboardAccess({ authProvider: 'apple', email: 'customer@example.com', erpAccess: true }), false);
  assert.equal(hasCustomerDashboardAccess({ authProvider: 'google', email: '' }), false);
  assert.equal(hasCustomerDashboardAccess({ authProvider: 'apple', email: '' }), false);
  assert.equal(hasCustomerDashboardAccess({ authProvider: 'unknown' }), false);

  const session = await authOptions.callbacks.session({
    session: { user: {} },
    token: googleToken,
  });
  assert.equal(session.user.authProvider, 'google');

  const appleSession = await authOptions.callbacks.session({
    session: { user: {} },
    token: appleToken,
  });
  assert.equal(appleSession.user.authProvider, 'apple');
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
