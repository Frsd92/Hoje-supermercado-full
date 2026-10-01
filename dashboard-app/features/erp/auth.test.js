import test from 'node:test';
import assert from 'node:assert/strict';

import { hasErpAccess } from './access.js';
import { createErpPasswordHash, normalizeErpUsername, verifyErpCredentials, verifyErpPassword } from './password.js';

test('ERP passwords are stored as salted scrypt hashes and verified', async () => {
  const password = 'A-long-test-password-2026';
  const hash = await createErpPasswordHash(password);

  assert.match(hash, /^scrypt\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/);
  assert.notEqual(hash, await createErpPasswordHash(password));
  assert.equal(await verifyErpPassword(password, hash), true);
  assert.equal(await verifyErpPassword('a-different-password', hash), false);
  assert.equal(await verifyErpPassword(password, 'invalid-hash'), false);
});

test('ERP password hashes enforce a minimum password length', async () => {
  await assert.rejects(createErpPasswordHash('short'), /entre 12 e 1024 caracteres/);
  await assert.rejects(createErpPasswordHash('x'.repeat(1025)), /entre 12 e 1024 caracteres/);
});

test('ERP credentials require the configured CEO username and password hash', async () => {
  const passwordHash = await createErpPasswordHash('Another-long-test-password');
  const config = { ERP_CEO_USERNAME: 'CEO.Owner', ERP_CEO_PASSWORD_HASH: passwordHash };

  assert.equal(await verifyErpCredentials(' ceo.owner ', 'Another-long-test-password', config), true);
  assert.equal(await verifyErpCredentials('other-user', 'Another-long-test-password', config), false);
  assert.equal(await verifyErpCredentials('ceo.owner', 'wrong-password', config), false);
  assert.equal(await verifyErpCredentials('ceo.owner', 'any-password', {}), false);
});

test('ERP usernames are normalized and restricted to safe characters', () => {
  assert.equal(normalizeErpUsername('  CEO.Owner_1-  '), 'ceo.owner_1-');
  assert.equal(normalizeErpUsername('ab'), '');
  assert.equal(normalizeErpUsername('bad username'), '');
  assert.equal(normalizeErpUsername('email@example.com'), '');
  assert.equal(normalizeErpUsername('x'.repeat(33)), '');
});

test('ERP access requires the CEO identity and the ERP credential claim', () => {
  const originalUsername = process.env.ERP_CEO_USERNAME;
  process.env.ERP_CEO_USERNAME = 'ceo.owner';
  const activeSession = { username: 'CEO.Owner', erpAccess: true, erpAccessExpiresAt: Date.now() + 60_000 };

  try {
    assert.equal(hasErpAccess(activeSession), true);
    assert.equal(hasErpAccess({ ...activeSession, username: 'other-user' }), false);
    assert.equal(hasErpAccess({ ...activeSession, erpAccess: false }), false);
    assert.equal(hasErpAccess({ ...activeSession, username: 42 }), false);
    assert.equal(hasErpAccess({ ...activeSession, erpAccessExpiresAt: Date.now() - 1 }), false);
  } finally {
    if (originalUsername === undefined) delete process.env.ERP_CEO_USERNAME;
    else process.env.ERP_CEO_USERNAME = originalUsername;
  }
});
