import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { normalizeDeliveryLocation } from '@/lib/delivery-location';
import { allocateOrderInventory } from '@/features/erp/api/order-inventory-fulfillment';
import { getOrderPromotionSnapshot } from '@/features/erp/api/product-pricing';
import {
  getServiceRegionError,
  getServiceRegionMatch,
  normalizeSavedAddress,
} from '@/features/service-regions/region-utils';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';
import { serializeOrder, serializeOrders } from './order-serialization.js';

const productsFile = path.join(process.cwd(), 'data', 'products.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);
const money = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;

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
    const orders = await prisma.order.findMany({ include: { items: true }, orderBy: { createdAt: 'desc' } });
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
  if (!Array.isArray(body?.items) || !body.items.length || !String(body?.addressId || '').trim()) {
    return Response.json({ error: 'Itens e endereço de entrega são obrigatórios.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (!['pix', 'cartao', 'dinheiro', 'outro'].includes(body.paymentMethod)) {
    return Response.json({ error: 'Selecione uma forma de pagamento válida antes de finalizar.' }, { status: 400, headers: corsHeaders(request) });
  }
  if (typeof body.includeCpfOnReceipt !== 'boolean') {
    return Response.json({ error: 'Informe se deseja CPF na nota para continuar.' }, { status: 400, headers: corsHeaders(request) });
  }

  const email = String(session.user.email || '').trim().toLowerCase();
  if (!email) return Response.json({ error: 'Não foi possível identificar sua conta para validar o endereço.' }, { status: 400, headers: corsHeaders(request) });

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
    let profile;
    try {
      profile = await prisma.customerProfile.findUnique({
        where: { email },
        select: { cpf: true },
      });
    } catch (error) {
      console.error('Não foi possível consultar o CPF do perfil para o pedido:', error);
      return Response.json({ error: 'Não foi possível consultar o CPF do perfil agora.' }, { status: 500, headers: corsHeaders(request) });
    }
    invoiceCpf = String(profile?.cpf || '').replace(/\D/g, '');
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
    });
  }
  const subtotal = orderItems.reduce((sum, item) => sum + money(item.price) * item.quantity, 0);
  const total = subtotal * (1 - appliedDiscountPercent / 100);
  const paymentMethod = body.paymentMethod;
  const orderId = `PED-${randomUUID()}`;
  try {
    const order = await prisma.$transaction(async (transaction) => {
      if (campaignCoupon) {
        await transaction.couponRedemption.create({
          data: { id: randomUUID(), campaignId: campaignCoupon.id, email, orderId },
        });
      }
      return transaction.order.create({
        data: {
          id: orderId,
          customerName: session.user.name || 'Cliente',
          customerEmail: email,
          address: addressLabel,
          addressDetails,
          total: `R$ ${total.toFixed(2).replace('.', ',')}`,
          subtotal: Number(subtotal.toFixed(2)),
          paymentMethod,
          includeCpfOnReceipt: body.includeCpfOnReceipt,
          invoiceCpf: body.includeCpfOnReceipt ? invoiceCpf : null,
          couponCode: campaignCoupon ? couponCode : null,
          couponDiscountPercent: campaignCoupon ? appliedDiscountPercent : null,
          couponDiscountAmount: Number((subtotal - total).toFixed(2)),
          status: 'Recebido',
          items: { create: orderItems },
        },
        include: { items: true },
      });
    });
    return Response.json({ order: serializeOrder(order) }, { status: 201, headers: corsHeaders(request) });
  } catch (error) {
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
    const record = await prisma.order.findUnique({ where: { id }, include: { items: true } });
    if (!record || record.status !== status) return Response.json({ error: 'Pedido não está no status esperado.' }, { status: 409, headers: corsHeaders(request) });
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
    const updatedOrder = await prisma.order.findUnique({ where: { id }, include: { items: true } });
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
