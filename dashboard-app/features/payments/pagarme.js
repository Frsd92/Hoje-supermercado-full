import { getSavedCardTypeLabel, isCardPaymentMethod, isVoucherPaymentMethod } from './card-methods.js';
import { normalizeSplitPaymentLines } from './split-payment.mjs';
import { isPixCodeExpired } from '../orders/pix-expiration.mjs';

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

function buildPaymentInstruction(method, {
  amountCents,
  cardReference,
  address,
  holderDocument,
  authorizeOnly = false,
} = {}) {
  const payment = amountCents === undefined ? {} : { amount: amountCents };
  if (method === 'pix') return { ...payment, payment_method: 'pix', pix: { expires_in: 3600 } };
  if (isVoucherPaymentMethod(method)) {
    if (authorizeOnly) throw new Error('Voucher não pode ser combinado porque a Pagar.me não oferece autorização sem captura para essa modalidade.');
    return {
      ...payment,
      payment_method: 'voucher',
      voucher: {
        statement_descriptor: 'HOJE SUPERM',
        card: { ...cardReference, holder_document: holderDocument },
      },
    };
  }
  if (method === 'cartao_debito') {
    return {
      ...payment,
      payment_method: 'debit_card',
      debit_card: {
        ...cardReference,
        capture: !authorizeOnly,
        installments: 1,
        statement_descriptor: 'HOJE SUPERM',
      },
    };
  }
  if (method === 'cartao_credito' || method === 'cartao') {
    return {
      ...payment,
      payment_method: 'credit_card',
      credit_card: {
        ...cardReference,
        installments: 1,
        operation_type: authorizeOnly ? 'auth_only' : 'auth_and_capture',
        statement_descriptor: 'HOJE SUPERM',
        billing_address: addressForBilling(address),
      },
    };
  }
  throw new Error('Selecione uma forma de pagamento online disponível.');
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
  deliveryFee = 0,
  serviceFee = 0,
  customer,
  paymentMethod,
  cardToken,
  savedCard,
  savedCardCustomerId,
  combinedPayments = [],
  address,
}) {
  const combinedPayment = paymentMethod === 'combinado';
  if (paymentMethod !== 'pix' && !isCardPaymentMethod(paymentMethod) && !combinedPayment) {
    throw new Error('Selecione uma forma de pagamento online disponível.');
  }
  if (!Array.isArray(items) || !items.length) throw new Error('O pedido não possui itens para pagamento.');

  const phone = splitBrazilianMobilePhone(customer.phone);
  const document = String(customer.cpf || '').replace(/\D/g, '');
  if (!isValidCpf(document)) throw new Error('Cadastre um CPF válido no perfil para continuar com o pagamento.');
  if (!phone) throw new Error('Cadastre um celular com DDD no perfil para continuar com o pagamento.');
  if (!String(customer.email || '').trim() || !String(customer.name || '').trim()) {
    throw new Error('Complete seu nome e e-mail no perfil antes de continuar com o pagamento.');
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
  const feeItems = [
    ['Taxa de entrega', 'DELIVERY-FEE', deliveryFee],
    ['Taxa de serviço', 'SERVICE-FEE', serviceFee],
  ].flatMap(([description, code, value]) => {
    let normalized = String(value ?? '').trim().replace(/^R\$\s*/i, '').replace(/\s/g, '');
    if (normalized.includes(',')) normalized = normalized.replace(/\./g, '').replace(',', '.');
    const parsedAmount = Number(normalized);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) throw new Error('O pedido contém uma taxa inválida para pagamento.');
    const amount = Math.round(parsedAmount * 100);
    if (!Number.isSafeInteger(amount)) throw new Error('O pedido contém uma taxa inválida para pagamento.');
    return amount > 0 ? [{ amount, description, quantity: 1, code }] : [];
  });
  const totalCents = Math.round(parseAmount(total) * 100);
  const productSubtotalCents = rawItems.reduce((sum, item) => sum + item.amount, 0);
  const feesCents = feeItems.reduce((sum, item) => sum + item.amount, 0);
  const payableProductsCents = totalCents - feesCents;
  if (totalCents > productSubtotalCents + feesCents
    || payableProductsCents < 0
    || payableProductsCents > productSubtotalCents) {
    throw new Error('O total do pedido não confere com os itens. Atualize o carrinho e tente novamente.');
  }
  let remainingCents = payableProductsCents;
  const payableItems = rawItems
    .map((item, index) => {
      const amount = index === rawItems.length - 1
        ? remainingCents
        : Math.floor(item.amount * payableProductsCents / productSubtotalCents);
      remainingCents -= amount;
      return { ...item, amount };
    })
    .filter((item) => item.amount > 0);
  const pagarmeItems = [...payableItems, ...feeItems];

  const cardPayment = isCardPaymentMethod(paymentMethod);
  const validCardToken = /^token_[A-Za-z0-9]+$/.test(String(cardToken || ''));
  const savedCustomerId = String(savedCard?.customerId || '');
  const savedCardId = String(savedCard?.cardId || '');
  const validSavedCard = /^cus_[A-Za-z0-9]+$/.test(savedCustomerId)
    && /^card_[A-Za-z0-9]+$/.test(savedCardId);
  if (savedCard && !validSavedCard) {
    throw new Error('O cartão salvo não está disponível para pagamento.');
  }
  if (cardPayment && validSavedCard && cardToken) {
    throw new Error('Escolha entre o cartão salvo e um novo cartão para continuar.');
  }
  if (cardPayment && !validSavedCard && !validCardToken) {
    throw new Error('O cartão precisa ser tokenizado novamente antes do pagamento.');
  }

  const savedCardCustomer = String(savedCardCustomerId || savedCustomerId || '');
  const hasCombinedCard = combinedPayment && combinedPayments.some((line) => line.method !== 'pix');
  if (hasCombinedCard && !/^cus_[A-Za-z0-9]+$/.test(savedCardCustomer)) {
    throw new Error('Não foi possível validar o cliente para usar os cartões salvos.');
  }

  let payments;
  if (combinedPayment) {
    const lines = normalizeSplitPaymentLines(combinedPayments, totalCents);
    payments = lines.map((line) => {
      const lineCardId = String(line.savedCardId || '');
      const isCard = line.method !== 'pix';
      if (isCard && !/^card_[A-Za-z0-9]+$/.test(lineCardId)) {
        throw new Error('Selecione um cartão salvo para cada parcela em cartão.');
      }
      return buildPaymentInstruction(line.method, {
        amountCents: line.amountCents,
        cardReference: isCard ? { card_id: lineCardId } : undefined,
        address,
        holderDocument: document,
        authorizeOnly: true,
      });
    });
  } else {
    const cardReference = validSavedCard ? { card_id: savedCardId } : { card_token: cardToken };
    payments = [buildPaymentInstruction(paymentMethod, {
      cardReference,
      address,
      holderDocument: document,
    })];
  }

  return {
    code: String(orderId).slice(0, 52),
    items: pagarmeItems,
    ...((validSavedCard || hasCombinedCard)
      ? { customer_id: savedCardCustomer }
      : {
        customer: {
          name: String(customer.name).trim().slice(0, 64),
          email: String(customer.email).trim().toLowerCase().slice(0, 64),
          type: 'individual',
          document,
          phones: { mobile_phone: phone },
        },
      }),
    payments,
    metadata: { internal_order_id: String(orderId) },
  };
}

export function getPagarmePaymentStatus(order) {
  const orderStatus = String(order?.status || '').toLowerCase();
  if (orderStatus === 'refunded') return 'refunded';
  if (orderStatus === 'partially_refunded') return 'partially_refunded';

  const charges = Array.isArray(order?.charges) ? order.charges : [];
  const capturedStatuses = new Set(['paid', 'captured']);
  const capturedCents = charges.reduce((total, charge) => {
    if (!capturedStatuses.has(String(charge?.status || '').toLowerCase())) return total;
    const amount = Number(charge.amount);
    return Number.isSafeInteger(amount) && amount > 0 ? total + amount : total;
  }, 0);
  const expectedCents = Number(order?.amount);
  if (orderStatus === 'paid' && (!Number.isSafeInteger(expectedCents) || expectedCents <= 0)) return 'paid';
  if (Number.isSafeInteger(expectedCents) && expectedCents > 0 && capturedCents >= expectedCents) return 'paid';
  if (!charges.length && orderStatus === 'paid') return 'paid';
  if (orderStatus === 'failed') return 'failed';
  if (orderStatus === 'expired' || orderStatus === 'overdue') return 'expired';
  if (orderStatus === 'canceled' || orderStatus === 'cancelled') return 'canceled';
  if (charges.length && charges.every((charge) => ['failed', 'canceled', 'cancelled', 'expired', 'overdue'].includes(String(charge?.status || '').toLowerCase()))) {
    if (charges.some((charge) => ['expired', 'overdue'].includes(String(charge.status).toLowerCase()))) return 'expired';
    return charges.some((charge) => String(charge.status).toLowerCase() === 'failed') ? 'failed' : 'canceled';
  }
  return 'pending';
}

export function getPagarmePaymentSnapshot(order, { combinedPayment = false } = {}) {
  const charges = Array.isArray(order?.charges) ? order.charges : [];
  const charge = charges[0] || null;
  const pixCharge = charges.find((item) => String(item?.payment_method || '').toLowerCase() === 'pix') || charge;
  const transaction = pixCharge?.last_transaction || {};
  const paymentStatus = getPagarmePaymentStatus(order);
  const pixDetails = paymentStatus === 'pending' && transaction.qr_code
    ? {
      pixQrCode: String(transaction.qr_code),
      pixQrCodeUrl: typeof transaction.qr_code_url === 'string' && transaction.qr_code_url.startsWith('https://api.pagar.me/')
        ? transaction.qr_code_url
        : null,
      pixExpiresAt: transaction.expires_at || null,
    }
    : null;
  const paymentDetails = combinedPayment && charges.length
    ? {
      ...(pixDetails || {}),
      payments: charges.map((item) => ({
        method: String(item?.payment_method || '').toLowerCase(),
        amountCents: Number(item?.amount) || 0,
        status: String(item?.status || '').toLowerCase(),
        chargeId: item?.id ? String(item.id) : null,
      })),
    }
    : pixDetails;

  return {
    pagarmeOrderId: String(order?.id || ''),
    pagarmeChargeId: charge?.id ? String(charge.id) : null,
    paymentStatus,
    paymentDetails,
  };
}

export function getPagarmeRefundedCents(order) {
  return (Array.isArray(order?.charges) ? order.charges : []).reduce((total, charge) => {
    const canceledAmount = Number(charge?.canceled_amount) || 0;
    return total + (Number.isSafeInteger(canceledAmount) && canceledAmount > 0 ? canceledAmount : 0);
  }, 0);
}

export async function refundPagarmeOrderCharges(orderId, amountCents, idempotencyKey, {
  getOrder = getPagarmeOrder,
  refundCharge = refundPagarmeCharge,
} = {}) {
  if (!Number.isSafeInteger(amountCents) || amountCents <= 0) {
    throw new Error('O valor do estorno não é válido.');
  }
  let order = await getOrder(orderId);
  if (String(order?.id || '') !== String(orderId)) {
    throw new Error('A consulta da Pagar.me não corresponde ao pedido para estorno.');
  }

  const initialRefundedCents = getPagarmeRefundedCents(order);
  let refundedForRequestCents = 0;
  for (const charge of Array.isArray(order.charges) ? order.charges : []) {
    if (refundedForRequestCents >= amountCents) break;
    if (!capturedChargeStatuses.has(String(charge?.status || '').toLowerCase())) continue;
    const chargeId = String(charge.id || '');
    const chargeAmountCents = Number(charge.amount);
    const alreadyRefundedCents = Number(charge.canceled_amount) || 0;
    const refundableCents = chargeAmountCents - alreadyRefundedCents;
    const remainingRequestCents = amountCents - refundedForRequestCents;
    const amountToRefundCents = Math.min(refundableCents, remainingRequestCents);
    if (!chargeId || !Number.isSafeInteger(chargeAmountCents) || chargeAmountCents <= 0
      || !Number.isSafeInteger(alreadyRefundedCents) || alreadyRefundedCents < 0
      || !Number.isSafeInteger(refundableCents)) {
      throw new Error('A Pagar.me retornou uma cobrança inválida para estorno.');
    }
    if (amountToRefundCents <= 0) continue;

    const refundResult = await refundCharge(chargeId, amountToRefundCents, `${idempotencyKey}-${chargeId}`);
    order = await getOrder(orderId);
    if (String(order?.id || '') !== String(orderId)) {
      throw new Error('A consulta da Pagar.me não corresponde ao pedido para estorno.');
    }
    refundedForRequestCents = Math.max(0, getPagarmeRefundedCents(order) - initialRefundedCents);
    if (['pending', 'pending_refund', 'processing'].includes(String(refundResult?.status || '').toLowerCase())) {
      break;
    }
    const updatedCharge = order.charges?.find((item) => String(item?.id || '') === chargeId);
    if ((Number(updatedCharge?.canceled_amount) || 0) < alreadyRefundedCents + amountToRefundCents) break;
    if (refundedForRequestCents < amountCents) {
      const currentCharge = order.charges?.find((item) => String(item?.id || '') === chargeId);
      if (Number(currentCharge?.canceled_amount) <= alreadyRefundedCents) break;
    }
  }

  return {
    order,
    refundedCents: getPagarmeRefundedCents(order),
    refundedForRequestCents,
  };
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
    if (response.ok) throw new Error('O processador de pagamentos retornou uma resposta inválida.');
  }
  if (!response.ok) throw new PagarmeApiError(response.status);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('O processador de pagamentos retornou uma resposta inválida.');
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

export function createPagarmeCustomer(payload) {
  return pagarmeRequest('/customers', {
    method: 'POST',
    body: payload,
  });
}

export function getPagarmeCustomerCards(customerId, { fetchImpl, secretKey } = {}) {
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customerId || ''))) {
    throw new Error('Não foi possível validar o cliente para consultar seus cartões.');
  }
  const requestOptions = { method: 'GET', secretKey };
  if (fetchImpl) requestOptions.fetchImpl = fetchImpl;
  return pagarmeRequest(`/customers/${encodeURIComponent(customerId)}/cards`, requestOptions);
}

export function createPagarmeCustomerCard(customerId, token, idempotencyKey, { cardType, fetchImpl, secretKey } = {}) {
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customerId || ''))) {
    throw new Error('Não foi possível validar os dados do cliente para o pagamento.');
  }
  if (!/^token_[A-Za-z0-9]+$/.test(String(token || ''))) {
    throw new Error('O cartão precisa ser tokenizado antes de ser salvo.');
  }
  const cardLabel = cardType === undefined ? null : getSavedCardTypeLabel(cardType);
  if (cardType !== undefined && !cardLabel) {
    throw new Error('Selecione se o cartão é de crédito ou débito.');
  }
  const requestOptions = {
    method: 'POST',
    body: { token, ...(cardLabel ? { label: cardLabel } : {}) },
    idempotencyKey,
    secretKey,
  };
  if (fetchImpl) requestOptions.fetchImpl = fetchImpl;
  return pagarmeRequest(`/customers/${encodeURIComponent(customerId)}/cards`, {
    ...requestOptions,
  });
}

export function deletePagarmeCustomerCard(customerId, cardId, fetchImpl) {
  if (!/^cus_[A-Za-z0-9]+$/.test(String(customerId || '')) || !/^card_[A-Za-z0-9]+$/.test(String(cardId || ''))) {
    throw new Error('O cartão salvo não é válido.');
  }
  const requestOptions = { method: 'DELETE' };
  if (fetchImpl) requestOptions.fetchImpl = fetchImpl;
  return pagarmeRequest(`/customers/${encodeURIComponent(customerId)}/cards/${encodeURIComponent(cardId)}`, {
    ...requestOptions,
  });
}

export function getPagarmeOrder(orderId) {
  return pagarmeRequest(`/orders/${encodeURIComponent(orderId)}`);
}

const capturedChargeStatuses = new Set(['paid', 'captured']);
const authorizedChargeStatuses = new Set(['authorized_pending_capture']);
const cardProviderMethods = new Set(['credit_card', 'debit_card']);

export async function captureReadyCombinedPayments(orderId, providerOrder, {
  captureCharge = capturePagarmeCharge,
  getOrder = getPagarmeOrder,
} = {}) {
  const charges = Array.isArray(providerOrder?.charges) ? providerOrder.charges : [];
  const cardCharges = charges.filter((charge) => cardProviderMethods.has(String(charge?.payment_method || '').toLowerCase()));
  const nonCardCharges = charges.filter((charge) => !cardProviderMethods.has(String(charge?.payment_method || '').toLowerCase()));
  if (charges.length !== 2
    || !cardCharges.length
    || !nonCardCharges.every((charge) => capturedChargeStatuses.has(String(charge?.status || '').toLowerCase()))
    || !cardCharges.every((charge) => {
      const status = String(charge?.status || '').toLowerCase();
      return capturedChargeStatuses.has(status) || authorizedChargeStatuses.has(status);
    })) {
    return providerOrder;
  }

  for (const charge of cardCharges) {
    if (capturedChargeStatuses.has(String(charge.status || '').toLowerCase())) continue;
    const amountCents = Number(charge.amount);
    if (!charge.id || !Number.isSafeInteger(amountCents) || amountCents <= 0) {
      throw new Error('A Pagar.me retornou uma autorização de cartão inválida para captura.');
    }
    await captureCharge(
      String(charge.id),
      amountCents,
      `CAP-${orderId}-${charge.id}`,
    );
  }

  return getOrder(providerOrder.id);
}

export async function releaseCombinedPaymentAuthorizations(providerOrder, {
  cancelCharge = cancelPagarmeCharge,
} = {}) {
  const charges = Array.isArray(providerOrder?.charges) ? providerOrder.charges : [];
  const cardCharges = charges.filter((charge) => (
    cardProviderMethods.has(String(charge?.payment_method || '').toLowerCase())
    && authorizedChargeStatuses.has(String(charge?.status || '').toLowerCase())
  ));
  for (const charge of cardCharges) {
    if (!charge.id) throw new Error('A Pagar.me retornou uma autorização de cartão sem identificador.');
    await cancelCharge(String(charge.id), `VOID-${providerOrder.id}-${charge.id}`);
  }
}

export async function settleCombinedPaymentOrder(orderId, providerOrder, {
  pixExpiresAt,
  orderStatus,
  now = Date.now(),
} = {}) {
  const paymentStatus = getPagarmePaymentStatus(providerOrder);
  const pixCharge = (Array.isArray(providerOrder?.charges) ? providerOrder.charges : [])
    .find((charge) => String(charge?.payment_method || '').toLowerCase() === 'pix');
  const expiration = pixExpiresAt || pixCharge?.last_transaction?.expires_at;
  const pixExpired = paymentStatus === 'pending' && isPixCodeExpired(expiration, now);
  if (orderStatus === 'Cancelado' || ['failed', 'canceled', 'expired'].includes(paymentStatus) || pixExpired) {
    return cancelCombinedPaymentOrder(orderId, providerOrder);
  }
  if (paymentStatus === 'pending') {
    return captureReadyCombinedPayments(orderId, providerOrder);
  }
  return providerOrder;
}

export async function cancelCombinedPaymentOrder(orderId, providerOrder, {
  cancelCharge = cancelPagarmeCharge,
  refundCharge = refundPagarmeCharge,
  getOrder = getPagarmeOrder,
} = {}) {
  let changed = false;
  for (const charge of Array.isArray(providerOrder?.charges) ? providerOrder.charges : []) {
    const status = String(charge?.status || '').toLowerCase();
    const chargeId = String(charge?.id || '');
    const amountCents = Number(charge?.amount);
    if (!chargeId) continue;

    if (capturedChargeStatuses.has(status)) {
      const alreadyRefunded = charge.canceled_amount === undefined ? 0 : Number(charge.canceled_amount);
      if (!Number.isSafeInteger(amountCents) || amountCents <= 0
        || !Number.isSafeInteger(alreadyRefunded) || alreadyRefunded < 0) {
        throw new Error('A Pagar.me retornou uma cobrança inválida para estorno.');
      }
      const refundableCents = amountCents - alreadyRefunded;
      if (refundableCents < 0) throw new Error('O estorno já registrado na Pagar.me excede o valor da cobrança.');
      if (refundableCents === 0) continue;
      await refundCharge(chargeId, refundableCents, `SPLIT-REFUND-${orderId}-${chargeId}`);
      changed = true;
    } else if (authorizedChargeStatuses.has(status) || status === 'pending') {
      await cancelCharge(chargeId, `SPLIT-CANCEL-${orderId}-${chargeId}`);
      changed = true;
    }
  }
  return changed ? getOrder(providerOrder.id) : providerOrder;
}

export function capturePagarmeCharge(chargeId, amountCents, idempotencyKey, { secretKey, fetchImpl } = {}) {
  const requestOptions = {
    method: 'PUT',
    body: { amount: amountCents },
    idempotencyKey,
  };
  if (secretKey) requestOptions.secretKey = secretKey;
  if (fetchImpl) requestOptions.fetchImpl = fetchImpl;
  return pagarmeRequest(`/charges/${encodeURIComponent(chargeId)}/capture`, requestOptions);
}

export function cancelPagarmeCharge(chargeId, idempotencyKey, { secretKey, fetchImpl } = {}) {
  const requestOptions = { method: 'DELETE', idempotencyKey };
  if (secretKey) requestOptions.secretKey = secretKey;
  if (fetchImpl) requestOptions.fetchImpl = fetchImpl;
  return pagarmeRequest(`/charges/${encodeURIComponent(chargeId)}`, requestOptions);
}

export function refundPagarmeCharge(chargeId, amountCents, idempotencyKey, { secretKey, fetchImpl } = {}) {
  const requestOptions = {
    method: 'DELETE',
    body: { amount: amountCents },
    idempotencyKey,
  };
  if (secretKey) requestOptions.secretKey = secretKey;
  if (fetchImpl) requestOptions.fetchImpl = fetchImpl;
  return pagarmeRequest(`/charges/${encodeURIComponent(chargeId)}`, requestOptions);
}
