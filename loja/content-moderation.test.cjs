const assert = require('node:assert/strict');
const test = require('node:test');
const { containsOffensiveContent } = require('../dashboard-app/lib/content-moderation.js');

test('blocks offensive terms regardless of accents, case, or common character substitutions', () => {
  assert.equal(containsOffensiveContent('PORRA!'), true);
  assert.equal(containsOffensiveContent('p0rr4'), true);
  assert.equal(containsOffensiveContent('Puuuuuta'), true);
  assert.equal(containsOffensiveContent('retardádo'), true);
  assert.equal(containsOffensiveContent('filho da puta'), true);
});

test('does not reject clean phrases or partial matches inside regular words', () => {
  assert.equal(containsOffensiveContent('Oferta de frutas frescas'), false);
  assert.equal(containsOffensiveContent('computador'), false);
  assert.equal(containsOffensiveContent('   '), false);
});
