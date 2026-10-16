const paymentMethods = {
  pix: { key: 'pix', label: 'Pix' },
  cartao: { key: 'cartao', label: 'Cartão (tipo não informado)' },
  cartao_credito: { key: 'cartao_credito', label: 'Cartão de crédito' },
  cartao_de_credito: { key: 'cartao_credito', label: 'Cartão de crédito' },
  credito: { key: 'cartao_credito', label: 'Cartão de crédito' },
  credit_card: { key: 'cartao_credito', label: 'Cartão de crédito' },
  cartao_debito: { key: 'cartao_debito', label: 'Cartão de débito' },
  cartao_de_debito: { key: 'cartao_debito', label: 'Cartão de débito' },
  debito: { key: 'cartao_debito', label: 'Cartão de débito' },
  debit_card: { key: 'cartao_debito', label: 'Cartão de débito' },
  vale_alimentacao: { key: 'vale_alimentacao', label: 'Vale-alimentação (VA)' },
  va: { key: 'vale_alimentacao', label: 'Vale-alimentação (VA)' },
  alimentacao: { key: 'vale_alimentacao', label: 'Vale-alimentação (VA)' },
  vale_refeicao: { key: 'vale_refeicao', label: 'Vale-refeição (VR)' },
  vr: { key: 'vale_refeicao', label: 'Vale-refeição (VR)' },
  refeicao: { key: 'vale_refeicao', label: 'Vale-refeição (VR)' },
  sodexo: { key: 'sodexo', label: 'Sodexo' },
  pluxee: { key: 'pluxee', label: 'Pluxee' },
  alelo: { key: 'alelo', label: 'Alelo' },
  ticket: { key: 'ticket', label: 'Ticket' },
  dinheiro: { key: 'dinheiro', label: 'Dinheiro' },
  outro: { key: 'outro', label: 'Outro' },
  nao_informado: { key: 'nao_informado', label: 'Não informado' },
};

function paymentMethodEntry(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return paymentMethods[normalized] || paymentMethods.nao_informado;
}

export function normalizeAnalyticsPaymentMethod(value) {
  return paymentMethodEntry(value).key;
}

export function getAnalyticsPaymentLabel(value) {
  return paymentMethodEntry(value).label;
}

export function isKnownAnalyticsPaymentMethod(value) {
  return paymentMethodEntry(value).key !== 'nao_informado';
}

export function aggregateAnalyticsPayments(records) {
  const stats = new Map();
  records.forEach(({ method, value }) => {
    const { key, label } = paymentMethodEntry(method);
    const current = stats.get(key) || { method: key, label, orders: 0, value: 0 };
    current.orders += 1;
    current.value += Number(value) || 0;
    stats.set(key, current);
  });
  return [...stats.values()].sort((first, second) => (
    second.orders - first.orders || second.value - first.value || first.label.localeCompare(second.label, 'pt-BR')
  ));
}
