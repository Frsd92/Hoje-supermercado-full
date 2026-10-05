const pagarmeApiUrl = 'https://api.pagar.me/core/v5';

export class PagarmeApiError extends Error {
  constructor(status) {
    super('A Pagar.me não conseguiu processar esta operação.');
    this.name = 'PagarmeApiError';
    this.status = status;
  }
}

export function isValidCpf(value) {
  const cpf = String(value || '').replace(/\D/g, '');
  if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;

  const calculateDigit = (length) => {
    const sum = cpf
      .slice(0, length)
      .split('')
      .reduce((total, digit, index) => total + Number(digit) * (length + 1 - index), 0);
    const remainder = (sum * 10) % 11;
    return remainder === 10 ? 0 : remainder;
  };

  return calculateDigit(9) === Number(cpf[9]) && calculateDigit(10) === Number(cpf[10]);
}

export function splitBrazilianMobilePhone(value) {
  let phone = String(value || '').replace(/\D/g, '');
  if (phone.startsWith('55') && (phone.length === 12 || phone.length === 13)) phone = phone.slice(2);
  if (!/^\d{10,11}$/.test(phone)) return null;

  return {
    country_code: '55',
    area_code: phone.slice(0, 2),
    number: phone.slice(2),
  };
}

function parseAmount(value) {
  let normalized = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
  if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
  const amount = Number(normalized);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('O pedido contém um valor inválido para pagamento.');
  return amount;
}

function addressForBilling(address = {}) {
  const line1 = [address.street, address.number, address.neighborhood].filter(Boolean).join(', ');
  const city = address.city || address.municipality;
  const state = address.stateCode || address.state;
  const zipCode = String(address.cep || address.zipCode || '').replace(/\D/g, '');
  if (!line1 || !city || !state || zipCode.length !== 8) {
    throw new Error('Complete o endereço de entrega com CEP, cidade e estado antes de pagar com cartão.');
  }

  return {
    line_1: line1.slice(0, 255),
    zip_code: zipCode,
    city: String(city).slice(0, 64),
    state: String(state).toUpperCase().slice(0, 2),
    country: 'BR',
  };
}

export function buildPagarmeOrderPayload({
  orderId,
  items,
  total,
  customer,
  paymentMethod,
  cardToken,
  address,
}) {
  if (!['pix', 'cartao'].includes(paymentMethod)) {
    throw new Error('A forma de pagamento não é processada pela Pagar.me.');
  }
  if (!Array.isArray(items) || !items.length) throw new Error('O pedido não possui itens para pagamento.');

  const phone = splitBrazilianMobilePhone(customer.phone);
  const document = String(customer.cpf || '').replace(/\D/g, '');
  if (!isValidCpf(document)) throw new Error('Cadastre um CPF válido no perfil para pagar pela Pagar.me.');
  if (!phone) throw new Error('Cadastre um celular com DDD no perfil para pagar pela Pagar.me.');
  if (!String(customer.email || '').trim() || !String(customer.name || '').trim()) {
    throw new Error('Complete seu nome e e-mail no perfil antes de pagar pela Pagar.me.');
  }

  const rawItems = items.map((item, index) => {
    const quantity = Number(item.quantity);
    if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('O pedido contém uma quantidade inválida.');
    const amount = Math.round(parseAmount(item.price) * quantity * 100);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw new Error('O pedido contém um valor inválido para pagamento.');

    const quantityText = item.unit === 'kg' ? ` (${quantity.toLocaleString('pt-BR')} kg)` : '';
    return {
      amount,
      description: `${String(item.name || 'Produto').slice(0, 200)}${quantityText}`,
      quantity: 1,
      code: String(item.productCode || item.productId || `ITEM-${index + 1}`).slice(0, 52),
    };
  });
  const totalCents = Math.round(parseAmount(total) * 100);
  const subtotalCents = rawItems.reduce((sum, item) => sum + item.amount, 0);
  if (totalCents > subtotalCents) {
    throw new Error('O total do pedido não confere com os itens. Atualize o carrinho e tente novamente.');
  }
  let remainingCents = totalCents;
  const pagarmeItems = rawItems
    .map((item, index) => {
      const amount = index === rawItems.length - 1
        ? remainingCents
        : Math.floor(item.amount * totalCents / subtotalCents);
      remainingCents -= amount;
      return { ...item, amount };
    })
    .filter((item) => item.amount > 0);

  const creditCard = paymentMethod === 'cartao';
  if (creditCard && !/^token_[A-Za-z0-9]+$/.test(String(cardToken || ''))) {
    throw new Error('O cartão precisa ser tokenizado novamente antes do pagamento.');
  }

  const payment = creditCard
    ? {
      payment_method: 'credit_card',
      credit_card: {
        card_token: cardToken,
        installments: 1,
        operation_type: 'auth_and_capture',
        statement_descriptor: 'HOJE SUPERM',
        billing_address: addressForBilling(address),
      },
    }
    : {
      payment_method: 'pix',
      pix: { expires_in: 3600 },
    };

  return {
    code: String(orderId).slice(0, 52),
    items: pagarmeItems,
    customer: {
      name: String(customer.name).trim().slice(0, 64),
      email: String(customer.email).trim().toLowerCase().slice(0, 64),
      type: 'individual',
      document,
      phones: { mobile_phone: phone },
    },
    payments: [payment],
    metadata: { internal_order_id: String(orderId) },
  };
}

export function getPagarmePaymentStatus(order) {
  const orderStatus = String(order?.status || '').toLowerCase();
  if (orderStatus === 'paid') return 'paid';
  if (orderStatus === 'failed') return 'failed';
  if (orderStatus === 'canceled' || orderStatus === 'cancelled') return 'canceled';
  if (orderStatus === 'refunded') return 'refunded';
  if (orderStatus === 'partially_refunded') return 'partially_refunded';

  const charges = Array.isArray(order?.charges) ? order.charges : [];
  if (charges.some((charge) => String(charge?.status || '').toLowerCase() === 'paid')) return 'paid';
  if (charges.length && charges.every((charge) => ['failed', 'canceled', 'cancelled'].includes(String(charge?.status || '').toLowerCase()))) {
    return charges.some((charge) => String(charge.status).toLowerCase() === 'failed') ? 'failed' : 'canceled';
  }
  return 'pending';
}

export function getPagarmePaymentSnapshot(order) {
  const charges = Array.isArray(order?.charges) ? order.charges : [];
  const charge = charges[0] || null;
  const transaction = charge?.last_transaction || {};
  const paymentStatus = getPagarmePaymentStatus(order);
  const details = paymentStatus === 'pending' && transaction.qr_code
    ? {
      pixQrCode: String(transaction.qr_code),
      pixQrCodeUrl: typeof transaction.qr_code_url === 'string' && transaction.qr_code_url.startsWith('https://api.pagar.me/')
        ? transaction.qr_code_url
        : null,
      pixExpiresAt: transaction.expires_at || null,
    }
    : null;

  return {
    pagarmeOrderId: String(order?.id || ''),
    pagarmeChargeId: charge?.id ? String(charge.id) : null,
    paymentStatus,
    paymentDetails: details,
  };
}

export function getPagarmeRefundedCents(order) {
  return (Array.isArray(order?.charges) ? order.charges : []).reduce((total, charge) => {
    const canceledAmount = Number(charge?.canceled_amount) || 0;
    return total + (Number.isSafeInteger(canceledAmount) && canceledAmount > 0 ? canceledAmount : 0);
  }, 0);
}

export async function pagarmeRequest(path, {
  method = 'GET',
  body,
  idempotencyKey,
  secretKey = process.env.PAGARME_SECRET_KEY,
  fetchImpl = fetch,
} = {}) {
  if (!secretKey) throw new Error('PAGARME_SECRET_KEY não está configurada.');

  const headers = {
    Accept: 'application/json',
    Authorization: `Basic ${Buffer.from(`${secretKey}:`).toString('base64')}`,
  };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (idempotencyKey) headers['Idempotency-Key'] = idempotencyKey;

  const response = await fetchImpl(`${pagarmeApiUrl}${path}`, {
    method,
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(15000),
  });
  let data = null;
  try {
    data = await response.json();
  } catch {
    if (response.ok) throw new Error('A Pagar.me retornou uma resposta inválida.');
  }
  if (!response.ok) throw new PagarmeApiError(response.status);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('A Pagar.me retornou uma resposta inválida.');
  }
  return data;
}

export function createPagarmeOrder(payload, orderId) {
  return pagarmeRequest('/orders', {
    method: 'POST',
    body: payload,
    idempotencyKey: orderId,
  });
}

export function getPagarmeOrder(orderId) {
  return pagarmeRequest(`/orders/${encodeURIComponent(orderId)}`);
}

export function refundPagarmeCharge(chargeId, amountCents, idempotencyKey) {
  return pagarmeRequest(`/charges/${encodeURIComponent(chargeId)}`, {
    method: 'DELETE',
    body: { amount: amountCents },
    idempotencyKey,
  });
}
