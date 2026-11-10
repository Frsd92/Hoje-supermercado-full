const assert = require('node:assert/strict');
const test = require('node:test');

test('parses valid Pix expiration timestamps and ignores missing or invalid values', async () => {
  const { getPixCodeExpiry } = await import('./pix-expiration.mjs');
  assert.equal(getPixCodeExpiry('2026-11-09T21:54:05-03:00'), Date.parse('2026-11-10T00:54:05Z'));
  assert.equal(getPixCodeExpiry(null), null);
  assert.equal(getPixCodeExpiry('invalid'), null);
});

test('marks a Pix code expired at its expiry time and remains valid beforehand', async () => {
  const { isPixCodeExpired } = await import('./pix-expiration.mjs');
  const expiresAt = '2026-11-10T00:54:05Z';
  assert.equal(isPixCodeExpired(expiresAt, Date.parse('2026-11-10T00:54:04Z')), false);
  assert.equal(isPixCodeExpired(expiresAt, Date.parse('2026-11-10T00:54:05Z')), true);
});

test('does not expire a Pix code without a valid expiry timestamp', async () => {
  const { isPixCodeExpired } = await import('./pix-expiration.mjs');
  assert.equal(isPixCodeExpired(null, Date.now()), false);
  assert.equal(isPixCodeExpired('not-a-date', Date.now()), false);
});
