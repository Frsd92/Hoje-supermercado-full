import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { sortOrdersNewestFirst } from '@/lib/order-sort';

const allowedEmails = (process.env.ERP_ALLOWED_EMAILS || '').split(',').map((email) => email.trim().toLowerCase()).filter(Boolean);
const ordersFile = path.join(process.cwd(), 'data', 'orders.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return { 'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010', 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', Vary: 'Origin' };
}

export async function OPTIONS(request) { return new Response(null, { status: 204, headers: corsHeaders(request) }); }

export async function GET(request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

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
  if (!body?.items?.length || !body?.address) return Response.json({ error: 'Itens e endereço são obrigatórios.' }, { status: 400, headers: corsHeaders(request) });

  let orders = [];
  try { orders = JSON.parse(await fs.readFile(ordersFile, 'utf8')); } catch { orders = []; }

  const paymentMethod = ['pix', 'cartao', 'dinheiro', 'outro'].includes(body.paymentMethod) ? body.paymentMethod : 'outro';
  const order = {
    id: `PED-${Date.now()}`,
    customerName: session.user.name || 'Cliente',
    customerEmail: session.user.email || '',
    items: body.items,
    address: body.address,
    total: body.total || 'R$ 0,00',
    paymentMethod,
    status: 'Recebido',
    createdAt: new Date().toLocaleString('pt-BR'),
  };

  await fs.mkdir(path.dirname(ordersFile), { recursive: true });
  await fs.writeFile(ordersFile, JSON.stringify([...orders, order], null, 2), 'utf8');
  return Response.json({ order }, { status: 201, headers: corsHeaders(request) });
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails.includes(email)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: corsHeaders(request) });

  const { id, status } = await request.json();
  const validTransitions = { Recebido: 'Separacao', Separacao: 'Expedicao', Expedicao: 'Em transito', 'Em transito': 'Concluido' };
  if (!id || !validTransitions[status]) return Response.json({ error: 'Transição inválida.' }, { status: 400, headers: corsHeaders(request) });

  let orders = [];
  try { orders = JSON.parse(await fs.readFile(ordersFile, 'utf8')); } catch { orders = []; }
  const order = orders.find((item) => item.id === id);
  if (!order || order.status !== status) return Response.json({ error: 'Pedido não está no status esperado.' }, { status: 409, headers: corsHeaders(request) });

  const updatedOrder = { ...order, status: validTransitions[status], updatedAt: new Date().toLocaleString('pt-BR'), updatedBy: session.user.email };
  await fs.writeFile(ordersFile, JSON.stringify(orders.map((item) => item.id === id ? updatedOrder : item), null, 2), 'utf8');
  return Response.json({ order: updatedOrder }, { headers: corsHeaders(request) });
}
