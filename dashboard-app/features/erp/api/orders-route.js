import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { normalizeDeliveryLocation } from '@/lib/delivery-location';
import { allocateOrderInventory } from '@/features/erp/api/order-inventory-fulfillment';
import { getOrderPromotionSnapshot } from '@/features/erp/api/product-pricing';
import { calculateOrderTotals } from '@/features/orders/order-receipt-data';
import {
  getServiceRegionError,
  getServiceRegionMatch,
  normalizeSavedAddress,
} from '@/features/service-regions/region-utils';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { serializeOrder, serializeOrders } from './order-serialization.js';
import {
  buildPagarmeOrderPayload,
  createPagarmeOrder,
  getPagarmeCustomerCards,
  getPagarmePaymentSnapshot,
  isValidCpf,
  PagarmeApiError,
  splitBrazilianMobilePhone,
} from '@/features/payments/pagarme';
import {
  getSavedCardType,
  isCardPaymentMethod,
  isCardTypeCompatible,
} from '@/features/payments/card-methods';

const productsFile = path.join(process.cwd(), 'data', 'products.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return { 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

function saoPauloToday() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeProductTitle(value) {
  return String(value || '').trim().toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

async function loadProductsForOrder(items) {
  const productIds = [...new Set(items
    .map((item) => String(item.productId || item.id || '').trim())
    .filter(Boolean))];
  const titles = [...new Set(items
    .map((item) => String(item.name || item.title || '').trim())
    .filter(Boolean))];
  const conditions = [
    ...(productIds.length ? [{ externalId: { in: productIds } }, { id: { in: productIds } }] : []),
    ...(titles.length ? [{ title: { in: titles } }] : []),
  ];
  if (!conditions.length) return { byId: new Map(), byTitle: new Map() };

  const databaseProducts = await prisma.product.findMany({
    where: { OR: conditions },
    select: {
      id: true,
      externalId: true,
      title: true,
      sku: true,
      barcode: true,
      price: true,
      cost: true,
      discount: true,
      status: true,
      metadata: true,
      categories: true,
      brand: true,
    },
  });

  let legacyProducts = [];
  try {
    const parsedProducts = JSON.parse(await fs.readFile(productsFile, 'utf8'));
    if (!Array.isArray(parsedProducts)) throw new Error('O catálogo legado possui um formato inválido.');
    legacyProducts = parsedProducts;
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const byId = new Map();
  const byTitle = new Map();
  const legacyById = new Map(legacyProducts.map((product) => [String(product.id || ''), product]));
  const legacyByTitle = new Map(legacyProducts.map((product) => [normalizeProductTitle(product.title), product]));
  const indexProduct = (product, additionalIds = []) => {
    [product.id, ...additionalIds].filter(Boolean).forEach((id) => byId.set(String(id), product));
    const title = normalizeProductTitle(product.title);
    if (title) byTitle.set(title, product);
  };
  legacyProducts.forEach((product) => indexProduct({ ...product, databaseId: null }));
  databaseProducts.forEach((record) => {
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? record.metadata
      : {};
    const legacyProduct = legacyById.get(String(record.externalId || ''))
      || legacyById.get(record.id)
      || legacyByTitle.get(normalizeProductTitle(record.title))
      || {};
    indexProduct({
      ...legacyProduct,
      ...metadata,
      id: record.id,
      databaseId: record.id,
      externalId: record.externalId,
      title: record.title,
      sku: record.sku || metadata.sku || legacyProduct.sku || '',
      barcode: record.barcode || metadata.barcode || legacyProduct.barcode || '',
      price: Number(record.price),
      cost: Number(record.cost),
      discount: Number(record.discount),
      status: record.status,
      categories: record.categories,
      brand: record.brand,
    }, [record.externalId]);
  });
  return { byId, byTitle };
}

export async function OPTIONS(request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

  try {
    const orders = await prisma.order.findMany({
      include: {
        items: true,
        refundRequests: { include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return Response.json({ orders: sortOrdersNewestFirst(serializeOrders(orders)) }, { headers: corsHeaders(request) });
  } catch (error) {
    console.error('Não foi possível carregar os pedidos do banco de dados:', error);
    return Response.json({ error: 'Não foi possível carregar os pedidos agora.' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: 'Login necessário.' }, { status: 401, headers: corsHeaders(request) });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers: corsHeaders(request) });
  }
  if ([
    'number',
    'cvv',
    'cardNumber',
    'cardCvv',
    'card_number',
    'card_cvv',
    'holder_name',
    'holderName',
    'exp_month',
    'expMonth',
    'exp_year',
    'expYear',
  ].some((field) => Object.hasOwn(body, field))) {
    return Response.json({ error: 'Envie somente o token seguro do cartão ou selecione um cartão salvo.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (!Array.isArray(body?.items) || !body.items.length || !String(body?.addressId || '').trim()) {
    return Response.json({ error: 'Itens e endereço de entrega são obrigatórios.' }, { status: 400, headers: corsHeaders(request) });
  }
  const cardPayment = isCardPaymentMethod(body.paymentMethod);
  if (body.paymentMethod !== 'pix' && !cardPayment) {
    return Response.json({ error: 'Selecione uma forma de pagamento válida antes de finalizar.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.useSavedCard !== undefined && typeof body.useSavedCard !== 'boolean') {
    return Response.json({ error: 'A seleção do cartão salvo é inválida.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.useSavedCard && !cardPayment) {
    return Response.json({ error: 'O cartão salvo só pode ser usado em pagamentos com cartão.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.useSavedCard && body.cardToken) {
    return Response.json({ error: 'Escolha entre o cartão salvo e um novo cartão para continuar.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.savedCardId !== undefined && !/^card_[A-Za-z0-9]+$/.test(String(body.savedCardId))) {
    return Response.json({ error: 'O cartão selecionado é inválido.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.savedCardId && (!cardPayment || !body.useSavedCard)) {
    return Response.json({ error: 'Selecione uma forma de pagamento com cartão para usar este cartão salvo.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.cardToken && !/^token_[A-Za-z0-9]+$/.test(String(body.cardToken))) {
    return Response.json({ error: 'O cartão precisa ser validado antes do pagamento.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (body.cardToken && !cardPayment) {
    return Response.json({ error: 'O token do cartão só pode ser usado em pagamentos com cartão.' }, { status: 400, headers: corsHeaders(request) });
  }
  const usesPagarme = body.paymentMethod === 'pix' || cardPayment;
  if (usesPagarme && !process.env.PAGARME_SECRET_KEY) {
    return Response.json({ error: 'O pagamento online ainda não está configurado. Tente novamente mais tarde.' }, { status: 503, headers: corsHeaders(request) });
  }
  if (cardPayment && !body.useSavedCard && !process.env.PAGARME_PUBLIC_KEY) {
    return Response.json({ error: 'A tokenização segura do cartão ainda não está configurada. Escolha Pix ou tente mais tarde.' }, { status: 503, headers: corsHeaders(request) });
  }
  if (typeof body.includeCpfOnReceipt !== 'boolean') {
    return Response.json({ error: 'Informe se deseja CPF na nota para continuar.' }, { status: 400, headers: corsHeaders(request) });
  }

  const email = String(session.user.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Não foi possível identificar sua conta para validar o endereço.' }, { status: 400, headers: corsHeaders(request) });
  const checkoutRequestId = String(body.checkoutRequestId || '').trim();
  if ((usesPagarme && !checkoutRequestId) || (checkoutRequestId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(checkoutRequestId))) {
    return Response.json({ error: 'Não foi possível identificar esta tentativa de compra. Atualize o carrinho e tente novamente.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (checkoutRequestId) {
    try {
      const existingOrder = await prisma.order.findFirst({
        where: { checkoutRequestId, customerEmail: email },
        include: {
          items: true,
          refundRequests: { include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
        },
      });
      if (existingOrder) {
        if (['failed', 'canceled'].includes(existingOrder.paymentStatus)) {
          return Response.json({ error: 'Esta tentativa de pagamento não foi aprovada. Confira os dados e inicie uma nova tentativa.' }, { status: 409, headers: corsHeaders(request) });
        }
        return Response.json({
          order: serializeOrder(existingOrder),
          reused: true,
          message: 'Esta tentativa já foi registrada; confira o pedido antes de iniciar outro pagamento.',
        }, { status: 200, headers: corsHeaders(request) });
      }
    } catch (error) {
      console.error('Não foi possível verificar uma tentativa anterior de checkout:', error);
      return Response.json({ error: 'Não foi possível verificar o pedido anterior agora.' }, { status: 500, headers: corsHeaders(request) });
    }
  }

  let customerProfile = null;
  if (body.includeCpfOnReceipt || usesPagarme) {
    try {
      customerProfile = await prisma.customerProfile.findUnique({
        where: { email },
        select: {
          cpf: true,
          whatsapp: true,
          fullName: true,
          pagarmeCustomerId: true,
          pagarmeCardId: true,
        },
      });
    } catch (error) {
      console.error('Não foi possível consultar os dados de pagamento do perfil:', error);
      return Response.json({ error: 'Não foi possível confirmar os dados do perfil agora.' }, { status: 500, headers: corsHeaders(request) });
    }
  }
  if (usesPagarme) {
    if (!isValidCpf(customerProfile?.cpf)) {
      return Response.json({ error: 'Cadastre um CPF válido no perfil para pagar com Pix ou cartão.' }, { status: 422, headers: corsHeaders(request) });
    }
    if (!splitBrazilianMobilePhone(customerProfile?.whatsapp)) {
      return Response.json({ error: 'Cadastre um celular com DDD no perfil para pagar com Pix ou cartão.' }, { status: 422, headers: corsHeaders(request) });
    }
    if (body.useSavedCard && !customerProfile?.pagarmeCustomerId) {
      return Response.json({ error: 'Não há cartão salvo disponível. Cadastre um cartão no Dashboard ou informe outro cartão.' }, { status: 422, headers: corsHeaders(request) });
    }
  }

  let selectedSavedCardId = '';
  if (cardPayment && body.useSavedCard) {
    selectedSavedCardId = String(
      body.savedCardId || (body.paymentMethod === 'cartao' ? customerProfile?.pagarmeCardId || '' : ''),
    );
    if (!/^card_[A-Za-z0-9]+$/.test(selectedSavedCardId)) {
      return Response.json({ error: 'Selecione um cartão salvo antes de finalizar.' }, { status: 422, headers: corsHeaders(request) });
    }

    let cardWallet;
    try {
      cardWallet = await getPagarmeCustomerCards(customerProfile.pagarmeCustomerId);
    } catch (error) {
      if (error instanceof PagarmeApiError) {
        return Response.json({ error: 'Não foi possível verificar o cartão selecionado.' }, { status: 502, headers: corsHeaders(request) });
      }
      console.error('Não foi possível validar o cartão escolhido no checkout:', error);
      return Response.json({ error: 'Não foi possível verificar o cartão selecionado.' }, { status: 502, headers: corsHeaders(request) });
    }
    if (!Array.isArray(cardWallet?.data)) {
      console.error('A Pagar.me retornou uma carteira de cartões inválida durante o checkout.');
      return Response.json({ error: 'Não foi possível verificar os cartões salvos.' }, { status: 502, headers: corsHeaders(request) });
    }
    const selectedCard = cardWallet.data.find((card) => card.id === selectedSavedCardId);
    if (String(selectedCard?.status || '').toLowerCase() !== 'active') {
      return Response.json({ error: 'O cartão selecionado não está ativo. Escolha outro cartão.' }, { status: 422, headers: corsHeaders(request) });
    }
    if (!isCardTypeCompatible(getSavedCardType(selectedCard), body.paymentMethod)) {
      return Response.json({ error: 'O tipo do cartão selecionado não corresponde à forma de pagamento. Escolha um cartão de crédito ou débito compatível.' }, { status: 422, headers: corsHeaders(request) });
    }
  }

  let savedAddress;
  let serviceRegions;
  try {
    const [addressBook, states] = await Promise.all([
      prisma.customerAddressBook.findUnique({ where: { email } }),
      prisma.serviceRegionState.findMany({
        include: { municipalities: true },
        orderBy: { name: 'asc' },
      }),
    ]);
    const addresses = addressBook?.addresses ?? [];
    if (!Array.isArray(addresses)) throw new Error('A lista de endereços armazenada possui um formato inválido.');
    savedAddress = addresses.find((address) => String(address?.id || '') === String(body.addressId).trim());
    serviceRegions = states;
  } catch (error) {
    console.error('Não foi possível validar a região do pedido:', error);
    return Response.json({ error: 'Não foi possível validar o endereço de entrega agora.' }, { status: 500, headers: corsHeaders(request) });
  }
  if (!savedAddress) {
    return Response.json({ error: 'O endereço selecionado não está mais cadastrado. Atualize a página e escolha outro endereço.' }, { status: 422, headers: corsHeaders(request) });
  }

  const normalizedAddress = normalizeSavedAddress(savedAddress, serviceRegions);
  const regionMatch = getServiceRegionMatch(normalizedAddress, serviceRegions);
  if (!regionMatch.allowed) {
    return Response.json({
      error: getServiceRegionError(normalizedAddress, regionMatch, serviceRegions),
      code: 'SERVICE_AREA_UNAVAILABLE',
    }, { status: 422, headers: corsHeaders(request) });
  }

  const addressLabel = [
    normalizedAddress.title,
    [normalizedAddress.street, normalizedAddress.number].filter(Boolean).join(', '),
    normalizedAddress.complement,
    normalizedAddress.neighborhood,
    [normalizedAddress.city, normalizedAddress.stateCode || normalizedAddress.state].filter(Boolean).join(' - '),
    normalizedAddress.country,
    normalizedAddress.cep,
  ].filter(Boolean).join(' | ');
  const addressDetails = normalizeDeliveryLocation({
    ...normalizedAddress,
    state: normalizedAddress.stateCode || normalizedAddress.state,
  });

  let invoiceCpf = '';
  if (body.includeCpfOnReceipt) {
    invoiceCpf = String(customerProfile?.cpf || '').replace(/\D/g, '');
    if (invoiceCpf.length !== 11) {
      return Response.json({ error: 'Cadastre um CPF com 11 dígitos no seu perfil antes de solicitar CPF na nota.' }, { status: 400, headers: corsHeaders(request) });
    }
  }

  const couponCode = String(body.couponCode || '').trim().toUpperCase();
  let campaignCoupon = null;
  if (couponCode) {
    try {
      campaignCoupon = await prisma.couponCampaign.findUnique({
        where: { code: couponCode },
        include: {
          recipients: { where: { email } },
          redemptions: { where: { email } },
        },
      });
    } catch (error) {
      console.error('Não foi possível verificar o cupom enviado ao cliente:', error);
      return Response.json({ error: 'Não foi possível validar o cupom agora.' }, { status: 500, headers: corsHeaders(request) });
    }
    if (!campaignCoupon
      || !campaignCoupon.recipients.length
      || campaignCoupon.expiresAt.getTime() <= Date.now()
      || campaignCoupon.redemptions.length) {
      return Response.json({ error: 'Este cupom não está disponível para sua conta ou já expirou/foi utilizado.' }, { status: 400, headers: corsHeaders(request) });
    }
  }
  const appliedDiscountPercent = campaignCoupon?.discountPercent || 0;
  let currentProducts;
  try {
    currentProducts = await loadProductsForOrder(body.items);
  } catch (error) {
    console.error('Não foi possível validar os preços atuais dos produtos do pedido:', error);
    return Response.json({ error: 'Não foi possível confirmar os preços atuais. Tente novamente.' }, { status: 500, headers: corsHeaders(request) });
  }
  const pricingTime = Date.now();
  const orderItems = [];
  for (const item of body.items) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return Response.json({ error: 'Um dos produtos do pedido é inválido.' }, { status: 400, headers: corsHeaders(request) });
    }
    const identifier = String(item.productId || item.id || '').trim();
    const product = currentProducts.byId.get(identifier)
      || currentProducts.byTitle.get(normalizeProductTitle(item.name || item.title));
    if (!product?.databaseId || product.status !== 'Ativo') {
      return Response.json({ error: 'Um dos produtos não está mais disponível. Atualize o carrinho e tente novamente.' }, { status: 409, headers: corsHeaders(request) });
    }

    const weightBased = product.saleUnit
      ? product.saleUnit === 'Quilograma'
      : item.unit === 'kg' || item.saleUnit === 'Quilograma';
    const requestedQuantity = Number(item.quantity);
    if (!Number.isFinite(requestedQuantity) || requestedQuantity <= 0) {
      return Response.json({ error: `A quantidade de ${product.title} é inválida.` }, { status: 400, headers: corsHeaders(request) });
    }
    const quantity = weightBased
      ? Math.max(0.1, Math.round(requestedQuantity * 10) / 10)
      : Math.max(1, Math.trunc(requestedQuantity));
    const promotionSnapshot = getOrderPromotionSnapshot(product, quantity, pricingTime);
    const currentPrice = promotionSnapshot.salePrice;
    if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
      return Response.json({ error: `Não foi possível confirmar o preço de ${product.title}.` }, { status: 409, headers: corsHeaders(request) });
    }
    orderItems.push({
      productId: product.databaseId,
      name: product.title,
      price: `R$ ${currentPrice.toFixed(2).replace('.', ',')}`,
      quantity,
      unit: weightBased ? 'kg' : 'unidade',
      unitCost: Number(product.cost) > 0 ? Number(product.cost) : null,
      promotionType: promotionSnapshot.promotionType,
      promotionDiscount: promotionSnapshot.promotionDiscount,
      productCode: String(product.barcode || product.sku || '').trim() || null,
    });
  }
  const { subtotal, couponDiscountAmount, total } = calculateOrderTotals(orderItems, appliedDiscountPercent);
  const paymentMethod = body.paymentMethod;
  const orderId = `PED-${randomUUID()}`;
  let pagarmePayload = null;
  if (usesPagarme) {
    try {
      pagarmePayload = buildPagarmeOrderPayload({
        orderId,
        items: orderItems,
        total,
        customer: {
          name: customerProfile?.fullName || session.user.name || 'Cliente',
          email,
          cpf: customerProfile?.cpf,
          phone: customerProfile?.whatsapp,
        },
        paymentMethod,
        cardToken: body.cardToken,
        savedCard: body.useSavedCard
          ? { customerId: customerProfile.pagarmeCustomerId, cardId: selectedSavedCardId }
          : null,
        address: normalizedAddress,
      });
    } catch (error) {
      return Response.json({ error: error.message || 'Não foi possível preparar o pagamento.' }, { status: 422, headers: corsHeaders(request) });
    }
  }
  try {
    const order = await prisma.$transaction(async (transaction) => {
      const customer = await transaction.user.upsert({
        where: { email },
        create: {
          email,
          name: customerProfile?.fullName || session.user.name || null,
          image: session.user.image || null,
        },
        update: {
          name: customerProfile?.fullName || session.user.name || undefined,
          image: session.user.image || undefined,
        },
      });
      if (campaignCoupon) {
        await transaction.couponRedemption.create({
          data: { id: randomUUID(), campaignId: campaignCoupon.id, email, orderId },
        });
      }
      return transaction.order.create({
        data: {
          id: orderId,
          userId: customer.id,
          customerName: customerProfile?.fullName || session.user.name || 'Cliente',
          customerEmail: email,
          address: addressLabel,
          addressDetails,
          total: `R$ ${total.toFixed(2).replace('.', ',')}`,
          subtotal: Number(subtotal.toFixed(2)),
          paymentMethod,
          paymentStatus: usesPagarme ? 'pending' : 'manual',
          checkoutRequestId: checkoutRequestId || null,
          includeCpfOnReceipt: body.includeCpfOnReceipt,
          invoiceCpf: body.includeCpfOnReceipt ? invoiceCpf : null,
          couponCode: campaignCoupon ? couponCode : null,
          couponDiscountPercent: campaignCoupon ? appliedDiscountPercent : null,
          couponDiscountAmount,
          status: 'Recebido',
          items: { create: orderItems },
        },
        include: { items: true },
      });
    });
    if (!usesPagarme) {
      return Response.json({ order: serializeOrder(order) }, { status: 201, headers: corsHeaders(request) });
    }

    try {
      const pagarmeOrder = await createPagarmeOrder(pagarmePayload, orderId);
      const paymentSnapshot = getPagarmePaymentSnapshot(pagarmeOrder);
      if (!paymentSnapshot.pagarmeOrderId) throw new Error('A Pagar.me retornou um pedido sem identificador.');

      const updatedOrder = await prisma.$transaction(async (transaction) => {
        const savedOrder = await transaction.order.update({
          where: { id: orderId },
          data: paymentSnapshot,
          include: { items: true },
        });
        if (['failed', 'canceled'].includes(paymentSnapshot.paymentStatus) && campaignCoupon) {
          await transaction.couponRedemption.deleteMany({ where: { orderId } });
        }
        return savedOrder;
      });
      if (['failed', 'canceled'].includes(paymentSnapshot.paymentStatus)) {
        return Response.json({
          error: 'O pagamento não foi aprovado. Confira os dados e tente outra forma de pagamento.',
          order: serializeOrder(updatedOrder),
        }, { status: 402, headers: corsHeaders(request) });
      }

      return Response.json({
        order: serializeOrder(updatedOrder),
        message: paymentSnapshot.paymentStatus === 'pending'
          ? 'Pedido criado. Conclua o pagamento para liberar a separação.'
          : 'Pagamento confirmado e pedido criado.',
      }, { status: 201, headers: corsHeaders(request) });
    } catch (error) {
      const definitivelyRejected = error instanceof PagarmeApiError
        && [400, 401, 403, 404, 422].includes(error.status);
      try {
        const updatedOrder = await prisma.$transaction(async (transaction) => {
          const savedOrder = await transaction.order.update({
            where: { id: orderId },
            data: { paymentStatus: definitivelyRejected ? 'failed' : 'pending', paymentDetails: null },
            include: { items: true },
          });
          if (definitivelyRejected && campaignCoupon) {
            await transaction.couponRedemption.deleteMany({ where: { orderId } });
          }
          return savedOrder;
        });
        if (definitivelyRejected) {
          console.warn('A Pagar.me recusou o pedido de pagamento:', error.status);
          return Response.json({
            error: 'O pagamento não foi aprovado. Confira os dados e tente outra forma de pagamento.',
            order: serializeOrder(updatedOrder),
          }, { status: 402, headers: corsHeaders(request) });
        }

        console.error('Não foi possível confirmar imediatamente a resposta da Pagar.me:', error);
        return Response.json({
          order: serializeOrder(updatedOrder),
          message: `O pedido ${orderId} foi registrado e aguarda confirmação do pagamento. Confira o status em Meus Pedidos antes de tentar novamente.`,
        }, { status: 202, headers: corsHeaders(request) });
      } catch (persistError) {
        console.error('Não foi possível registrar o resultado pendente do pagamento Pagar.me:', persistError);
        return Response.json({ error: 'O pedido foi iniciado, mas não foi possível atualizar o pagamento. Entre em contato com a loja antes de tentar novamente.' }, { status: 500, headers: corsHeaders(request) });
      }
    }
  } catch (error) {
    if (checkoutRequestId && error.code === 'P2002') {
      try {
        const existingOrder = await prisma.order.findUnique({
          where: { checkoutRequestId },
          include: {
            items: true,
            refundRequests: { include: { events: { orderBy: { createdAt: 'asc' } } }, orderBy: { createdAt: 'desc' } },
          },
        });
        if (existingOrder) {
          return Response.json({
            order: serializeOrder(existingOrder),
            reused: true,
            message: 'Esta tentativa já foi registrada; confira o pedido antes de iniciar outro pagamento.',
          }, { status: 200, headers: corsHeaders(request) });
        }
      } catch (lookupError) {
        console.error('Não foi possível consultar o pedido criado em uma tentativa concorrente:', lookupError);
        return Response.json({ error: 'Não foi possível confirmar se o pedido já foi registrado.' }, { status: 500, headers: corsHeaders(request) });
      }
    }
    if (campaignCoupon && error.code === 'P2002') {
      return Response.json({ error: 'Este cupom já foi utilizado.' }, { status: 400, headers: corsHeaders(request) });
    }
    console.error('Não foi possível salvar o pedido no banco de dados:', error);
    return Response.json({ error: 'Não foi possível salvar o pedido agora.' }, { status: 500, headers: corsHeaders(request) });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  let id;
  let status;
  try {
    ({ id, status } = await request.json());
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers: corsHeaders(request) });
  }
  const validTransitions = { Recebido: 'Separacao', Separacao: 'Expedicao', Expedicao: 'Em transito', 'Em transito': 'Concluido' };
  if (!id || !validTransitions[status]) return Response.json({ error: 'Transição inválida.' }, { status: 400, headers: corsHeaders(request) });

  let order;
  try {
    const record = await prisma.order.findUnique({
      where: { id },
      include: { items: true, refundRequests: { include: { events: { orderBy: { createdAt: 'asc' } } } } },
    });
    if (!record || record.status !== status) return Response.json({ error: 'Pedido não está no status esperado.' }, { status: 409, headers: corsHeaders(request) });
    if (status === 'Recebido'
      && ['pix', 'cartao'].includes(record.paymentMethod)
      && record.paymentStatus !== 'manual'
      && !['paid', 'partially_refunded'].includes(record.paymentStatus)) {
      return Response.json({ error: 'A separação só pode começar depois da confirmação do pagamento pela Pagar.me.' }, { status: 409, headers: corsHeaders(request) });
    }
    order = serializeOrder(record);
  } catch (error) {
    console.error('Não foi possível carregar o pedido para atualizar o status:', error);
    return Response.json({ error: 'Não foi possível carregar o pedido agora.' }, { status: 500, headers: corsHeaders(request) });
  }

  if (status === 'Recebido') {
    try {
      const allocationResult = await prisma.$transaction(
        (transaction) => allocateOrderInventory(transaction, order, actor, saoPauloToday()),
        { isolationLevel: 'Serializable' },
      );
      if (allocationResult.error) {
        return Response.json({ error: allocationResult.error }, { status: 409, headers: corsHeaders(request) });
      }
    } catch (error) {
      if (error?.code === 'P2034' || error?.code === 'P2002') {
        return Response.json({ error: 'A separação deste pedido foi iniciada em outra operação. Atualize a fila antes de continuar.' }, { status: 409, headers: corsHeaders(request) });
      }
      console.error('Não foi possível baixar o estoque por lote ao iniciar a separação:', error);
      return Response.json({ error: 'Não foi possível reservar o estoque válido deste pedido. Nenhuma alteração de status foi salva.' }, { status: 500, headers: corsHeaders(request) });
    }
  }

  try {
    const result = await prisma.order.updateMany({
      where: { id, status },
      data: { status: validTransitions[status], updatedBy: actor, updatedAt: new Date() },
    });
    if (result.count !== 1) {
      return Response.json({ error: 'O pedido já foi atualizado por outra operação. Atualize a fila.' }, { status: 409, headers: corsHeaders(request) });
    }
    const updatedOrder = await prisma.order.findUnique({
      where: { id },
      include: {
        items: true,
        refundRequests: { include: { events: { orderBy: { createdAt: 'asc' } } } },
      },
    });
    if (!updatedOrder) throw new Error('O pedido atualizado não foi encontrado.');
    return Response.json({ order: serializeOrder(updatedOrder) }, { headers: corsHeaders(request) });
  } catch (error) {
    console.error('Não foi possível salvar o novo status do pedido após processar o estoque:', error);
    return Response.json({
      error: status === 'Recebido'
        ? 'O estoque foi reservado por lote, mas não foi possível salvar o status do pedido. Atualize a fila e tente novamente.'
        : 'Não foi possível salvar o novo status do pedido.',
    }, { status: 500, headers: corsHeaders(request) });
  }
}
