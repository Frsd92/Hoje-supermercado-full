import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { normalizeDeliveryLocation } from '@/lib/delivery-location';
import { prisma } from '@/lib/prisma';
import { randomUUID } from 'crypto';

const ordersFile = path.join(process.cwd(), 'data', 'orders.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);
const money = (value) => Number(String(value || '').replace(/[^0-9,.-]/g, '').replace(/\.(?=\d{3}(?:\D|$))/g, '').replace(',', '.')) || 0;

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return { 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
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
  if (!Array.isArray(body?.items) || !body.items.length || !body?.address) return Response.json({ error: 'Itens e endereço são obrigatórios.' }, { status: 400, headers: corsHeaders(request) });

  let orders = [];
  try {
    const savedOrders = JSON.parse(await fs.readFile(ordersFile, 'utf8'));
    orders = Array.isArray(savedOrders) ? savedOrders : [];
  } catch { orders = []; }

  const email = String(session.user.email || '').trim().toLowerCase();
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
  const orderItems = body.items.map((item) => {
    const weightBased = item.unit === 'kg' || item.saleUnit === 'Quilograma';
    const requestedQuantity = Number(item.quantity);
    const quantity = weightBased
      ? Math.max(0.1, Math.round((Number.isFinite(requestedQuantity) ? requestedQuantity : 0.1) * 10) / 10)
      : Math.max(1, Math.trunc(Number.isFinite(requestedQuantity) ? requestedQuantity : 1));
    return { ...item, quantity, ...(weightBased ? { unit: 'kg' } : { unit: 'unidade' }) };
  });
  const subtotal = orderItems.reduce((sum, item) => sum + money(item.price) * item.quantity, 0);
  const total = subtotal * (1 - appliedDiscountPercent / 100);
  const paymentMethod = ['pix', 'cartao', 'dinheiro', 'outro'].includes(body.paymentMethod) ? body.paymentMethod : 'outro';
  const addressDetails = body.addressDetails && typeof body.addressDetails === 'object'
    ? normalizeDeliveryLocation(body.addressDetails)
    : null;
  const order = {
    id: `PED-${Date.now()}`,
    customerName: session.user.name || 'Cliente',
    customerEmail: session.user.email || '',
    items: orderItems,
    address: body.address,
    ...(addressDetails && (addressDetails.state || addressDetails.municipality || addressDetails.neighborhood) ? { addressDetails } : {}),
    total: `R$ ${total.toFixed(2).replace('.', ',')}`,
    ...(couponCode ? { couponCode, couponDiscountPercent: appliedDiscountPercent } : {}),
    paymentMethod,
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
  try { orders = JSON.parse(await fs.readFile(ordersFile, 'utf8')); } catch { orders = []; }
  const order = orders.find((item) => item.id === id);
  if (!order || order.status !== status) return Response.json({ error: 'Pedido não está no status esperado.' }, { status: 409, headers: corsHeaders(request) });

  const updatedOrder = { ...order, status: validTransitions[status], updatedAt: new Date().toLocaleString('pt-BR'), updatedBy: actor };
  await fs.writeFile(ordersFile, JSON.stringify(orders.map((item) => item.id === id ? updatedOrder : item), null, 2), 'utf8');
  return Response.json({ order: updatedOrder }, { headers: corsHeaders(request) });
}
