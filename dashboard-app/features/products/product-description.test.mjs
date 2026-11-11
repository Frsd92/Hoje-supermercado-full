import assert from 'node:assert/strict';
import test from 'node:test';
import { getProductDescriptionText, parseProductDescription } from './product-description.mjs';

test('parses double-asterisk phrases as bold text', () => {
  assert.deepEqual(parseProductDescription('Doce e suculento. **Produto selecionado** para você.'), [
    { text: 'Doce e suculento. ', bold: false },
    { text: 'Produto selecionado', bold: true },
    { text: ' para você.', bold: false },
  ]);
});

test('keeps unmatched markers as plain text and strips formatting for metadata', () => {
  assert.deepEqual(parseProductDescription('Oferta **especial'), [
    { text: 'Oferta **especial', bold: false },
  ]);
  assert.equal(getProductDescriptionText('Fresco **e selecionado** todos os dias.'), 'Fresco e selecionado todos os dias.');
  assert.equal(getProductDescriptionText('<b>Texto</b>'), '<b>Texto</b>');
});
