import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { normalizeDeliveryLocation } from '@/lib/delivery-location';
import { allocateOrderInventory } from '@/features/erp/api/order-inventory-fulfillment';
import { calculateSalePrice } from '@/features/erp/api/product-pricing';
import {
  getServiceRegionError,
  getServiceRegionMatch,
  normalizeSavedAddress,
} from '@/features/service-regions/region-utils';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

const ordersFile = path.join(process.cwd(), 'data', 'orders.json');
const productsFile = path.join(process.cwd(), 'data', 'products.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);
const money = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return { 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
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
    select: { id: true, externalId: true, title: true, price: true, discount: true, status: true, metadata: true },
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
  const indexProduct = (product, additionalIds = []) => {
    [product.id, ...additionalIds].filter(Boolean).forEach((id) => byId.set(String(id), product));
    const title = normalizeProductTitle(product.title);
    if (title) byTitle.set(title, product);
  };
  legacyProducts.forEach((product) => indexProduct(product));
  databaseProducts.forEach((record) => {
    const metadata = record.metadata && typeof record.metadata === 'object' && !Array.isArray(record.metadata)
      ? record.metadata
      : {};
    indexProduct({
      ...metadata,
      id: record.externalId || record.id,
      title: record.title,
      price: Number(record.price),
      discount: Number(record.discount),
      status: record.status,
    }, [record.id, record.externalId]);
  });
  return { byId, byTitle };
}

export async function OPTIONS(request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

  try {
    const orders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    return Response.json({ orders: sortOrdersNewestFirst(Array.isArray(orders) ? orders : []) }, { headers: corsHeaders(request) });
  } catch {
    return Response.json({ orders: [] }, { headers: corsHeaders(request) });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return Response.json({ error: 'Login necessário.' }, { status: 401, headers: corsHeaders(request) });

  const body = await request.json();
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

  let orders = [];
  try {
    const savedOrders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    orders = Array.isArray(savedOrders) ? savedOrders : [];
  } catch { orders = []; }

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
  const orderItems = body.items.map((item) => {
    const weightBased = item.unit === 'kg' || item.saleUnit === 'Quilograma';
    const requestedQuantity = Number(item.quantity);
    const quantity = weightBased
      ? Math.max(0.1, Math.round((Number.isFinite(requestedQuantity) ? requestedQuantity : 0.1) * 10) / 10)
      : Math.max(1, Math.trunc(Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
    const identifier = String(item.productId || item.id || '').trim();
    const product = currentProducts.byId.get(identifier)
      || currentProducts.byTitle.get(normalizeProductTitle(item.name || item.title));
    const hasFlashOfferConfiguration = product && (
      product.flashOfferEnabled === true
      || product.flashOfferPrice !== undefined
      || product.flashOfferStart !== undefined
      || product.flashOfferEnd !== undefined
    );
    const orderItem = {
      ...item,
      ...(product?.id ? { productId: product.id } : {}),
      quantity,
      ...(weightBased ? { unit: 'kg' } : { unit: 'unidade' }),
    };
    if (hasFlashOfferConfiguration) {
      const currentPrice = calculateSalePrice(product, pricingTime);
      orderItem.price = `R$ ${currentPrice.toFixed(2).replace('.', ',')}`;
    }
    return orderItem;
  });
  const subtotal = orderItems.reduce((sum, item) => sum + money(item.price) * item.quantity, 0);
  const total = subtotal * (1 - appliedDiscountPercent / 100);
  const paymentMethod = body.paymentMethod;
  const order = {
    id: `PED-${Date.now()}`,
    customerName: session.user.name || 'Cliente',
    customerEmail: session.user.email || '',
    items: orderItems,
    address: addressLabel,
    ...(addressDetails.state || addressDetails.municipality || addressDetails.neighborhood ? { addressDetails } : {}),
    total: `R$ ${total.toFixed(2).replace('.', ',')}`,
    ...(couponCode ? { couponCode, couponDiscountPercent: appliedDiscountPercent } : {}),
    paymentMethod,
    includeCpfOnReceipt: body.includeCpfOnReceipt,
    ...(body.includeCpfOnReceipt ? { invoiceCpf } : {}),
    status: 'Recebido',
    createdAt: new Date().toLocaleString('pt-BR'),
  };

  if (campaignCoupon) {
    try {
      await prisma.couponRedemption.create({
        data: { id: randomUUID(), campaignId: campaignCoupon.id, email, orderId: order.id },
      });
    } catch (error) {
      if (error.code === 'P2002') return Response.json({ error: 'Este cupom já foi utilizado.' }, { status: 400, headers: corsHeaders(request) });
      console.error('Não foi possível registrar o uso do cupom:', error);
      return Response.json({ error: 'Não foi possível confirmar o uso do cupom.' }, { status: 500, headers: corsHeaders(request) });
    }
  }

  try {
    await fs.mkdir(path.dirname(ordersFile), { recursive: true });
    await fs.writeFile(ordersFile, JSON.stringify([...orders, order], null, 2), 'utf8');
  } catch (error) {
    if (campaignCoupon) {
      await prisma.couponRedemption.deleteMany({ where: { campaignId: campaignCoupon.id, email, orderId: order.id } });
    }
    console.error('Não foi possível salvar o pedido:', error);
    return Response.json({ error: 'Não foi possível salvar o pedido.' }, { status: 500, headers: corsHeaders(request) });
  }
  return Response.json({ order }, { status: 201, headers: corsHeaders(request) });
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });
  const actor = erpActorLabel(session?.user);

  const { id, status } = await request.json();
  const validTransitions = { Recebido: 'Separacao', Separacao: 'Expedicao', Expedicao: 'Em transito', 'Em transito': 'Concluido' };
  if (!id || !validTransitions[status]) return Response.json({ error: 'Transição inválida.' }, { status: 400, headers: corsHeaders(request) });

  let orders = [];
  try { orders = JSON.parse(await fs.readFile(ordersFile, 'utf8')); } catch (error) {
    console.error('Não foi possível ler os pedidos para atualizar o status:', error);
    return Response.json({ error: 'Não foi possível carregar os pedidos para atualizar o status.' }, { status: 500, headers: corsHeaders(request) });
  }
  const order = orders.find((item) => item.id === id);
  if (!order || order.status !== status) return Response.json({ error: 'Pedido não está no status esperado.' }, { status: 409, headers: corsHeaders(request) });

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

  const updatedOrder = { ...order, status: validTransitions[status], updatedAt: new Date().toLocaleString('pt-BR'), updatedBy: actor };
  try {
    await fs.writeFile(ordersFile, JSON.stringify(orders.map((item) => item.id === id ? updatedOrder : item), null, 2), 'utf8');
  } catch (error) {
    console.error('Não foi possível salvar o novo status do pedido após processar o estoque:', error);
    return Response.json({
      error: status === 'Recebido'
        ? 'O estoque foi reservado por lote, mas não foi possível salvar o status do pedido. Tente novamente; a baixa não será repetida.'
        : 'Não foi possível salvar o novo status do pedido.',
    }, { status: 500, headers: corsHeaders(request) });
  }
  return Response.json({ order: updatedOrder }, { headers: corsHeaders(request) });
}
