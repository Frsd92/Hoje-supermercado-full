import test from 'node:test';
import assert from 'node:assert/strict';
import { validateImageDataUrl } from './image-data.js';

test('validates supported base64 image data URLs and preserves their content types', () => {
  assert.deepEqual(validateImageDataUrl('data:image/png;base64,iVBORw0KGgo='), {
    contentType: 'image/png',
    imageData: 'iVBORw0KGgo=',
  });
  assert.deepEqual(validateImageDataUrl('data:image/jpeg;base64,/9j/'), {
    contentType: 'image/jpeg',
    imageData: '/9j/',
  });
  assert.deepEqual(validateImageDataUrl('data:image/webp;base64,UklGRg=='), {
    contentType: 'image/webp',
    imageData: 'UklGRg==',
  });
});

test('rejects unsupported, malformed, and oversized image data URLs', () => {
  assert.equal(validateImageDataUrl('data:image/svg+xml;base64,PHN2Zz4='), null);
  assert.equal(validateImageDataUrl('data:image/png;base64,AAAA'), null);
  assert.equal(validateImageDataUrl(`data:image/png;base64,iVBORw0KGgo=${'A'.repeat(599_992)}`, { maxBytes: 450_000 }), null);
});
