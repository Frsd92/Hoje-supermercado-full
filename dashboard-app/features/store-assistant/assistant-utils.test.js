import test from 'node:test';
import assert from 'node:assert/strict';

import {
  rankAssistantProducts,
  redactPersonalInformation,
  validateAssistantReply,
} from './assistant-utils.js';

test('redacts common personal data before a customer message is sent to the model', () => {
  const redacted = redactPersonalInformation('Meu CPF 123.456.789-00, tel (11) 99999-1234, cliente@example.com, moro na Rua das Flores, 123, Centro.');
  assert.doesNotMatch(redacted, /123\.456\.789-00|99999-1234|cliente@example\.com|Rua das Flores/i);
  assert.match(redacted, /\[CPF removido\]/);
  assert.match(redacted, /\[telefone removido\]/);
  assert.match(redacted, /\[e-mail removido\]/);
  assert.match(redacted, /\[endereço removido\]/);
});

test('ranks active products by query and excludes inactive products', () => {
  const products = [
    { id: 'a', title: 'Leite integral', categories: ['Laticínios'], status: 'Ativo' },
    { id: 'b', title: 'Arroz branco', categories: ['Mercearia'], status: 'Ativo' },
    { id: 'c', title: 'Leite sem lactose', categories: ['Laticínios'], status: 'Inativo' },
  ];

  assert.deepEqual(rankAssistantProducts(products, 'leite').map((product) => product.id), ['a']);
});

test('only returns recommendations from the active candidate list', () => {
  const products = [{ id: 'available', title: 'Leite', salePrice: 5.5, saleUnit: 'Unidade', status: 'Ativo' }];
  const result = validateAssistantReply({
    reply: 'Encontrei este leite.',
    recommendedProductIds: ['available', 'invented'],
  }, products);

  assert.equal(result.reply, 'Encontrei este leite.');
  assert.deepEqual(result.recommendations.map((product) => product.id), ['available']);
});
