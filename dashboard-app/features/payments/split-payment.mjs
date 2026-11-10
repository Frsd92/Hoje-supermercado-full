const splitPaymentMethods = new Set(['pix', 'cartao_credito', 'cartao_debito']);

export function isSplitPaymentMethod(method) {
  return splitPaymentMethods.has(method);
}

export function parsePaymentAmountToCents(value) {
  const normalized = String(value ?? '').trim();
  if (!/^\d+(?:[,.]\d{1,2})?$/.test(normalized)) return null;

  const [whole, fraction = ''] = normalized.replace(',', '.').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  return Number.isSafeInteger(cents) ? cents : null;
}

export function normalizeSplitPaymentLines(lines, totalCents) {
  if (!Array.isArray(lines) || lines.length !== 2) {
    throw new Error('Escolha exatamente duas formas de pagamento.');
  }
  if (!Number.isSafeInteger(totalCents) || totalCents <= 0) {
    throw new Error('O total do pedido não é válido para dividir o pagamento.');
  }

  const normalized = lines.map((line) => {
    if (!line || typeof line !== 'object' || Array.isArray(line) || !isSplitPaymentMethod(line.method)) {
      throw new Error('No pagamento combinado, use Pix, cartão de crédito ou cartão de débito. Voucher não pode ser combinado.');
    }
    if (!Number.isSafeInteger(line.amountCents) || line.amountCents <= 0) {
      throw new Error('Informe um valor válido, maior que zero, para cada forma de pagamento.');
    }

    return {
      method: line.method,
      amountCents: line.amountCents,
      ...(line.savedCardId ? { savedCardId: String(line.savedCardId) } : {}),
    };
  });

  if (new Set(normalized.map((line) => line.method)).size !== normalized.length) {
    throw new Error('Escolha duas formas de pagamento diferentes.');
  }
  if (normalized.reduce((sum, line) => sum + line.amountCents, 0) !== totalCents) {
    throw new Error('A soma das duas formas de pagamento precisa ser exatamente igual ao total do pedido.');
  }

  return normalized.sort((first, second) => {
    if (first.method === 'pix') return 1;
    if (second.method === 'pix') return -1;
    return 0;
  });
}
