import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { normalizeCartItems } from '@/app/dashboard/cart-utils';
import { prisma } from '@/lib/prisma';

const dataDirectory = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDirectory, 'cart.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://127.0.0.1:5500', 'http://localhost:5500', 'null']);

function headers(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Hoje-Cart-Id',
    Vary: 'Origin',
  };
}

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(dataFile, 'utf8'));
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8');
}

async function getUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

function userKey(user) {
  return user.email?.trim().toLowerCase() || user.name || 'cliente';
}

function readCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  const value = cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  return value ? decodeURIComponent(value.slice(name.length + 1)) : '';
}

function cartIdentity(request, user) {
  const guestId = request.headers.get('x-hoje-cart-id') || readCookie(request, 'hoje-cart-id') || crypto.randomUUID();
  return { key: user ? userKey(user) : `guest:${guestId}`, guestId };
}

function responseHeaders(request, guestId) {
  return {
    ...headers(request),
    'Set-Cookie': `hoje-cart-id=${encodeURIComponent(guestId)}; Path=/; Max-Age=2592000; SameSite=Lax`,
  };
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function GET(request) {
  const user = await getUser();
  const store = await readStore();
  const identity = cartIdentity(request, user);
  let cart = normalizeCartItems(store[identity.key] || []);

  if (user?.email) {
    try {
      const savedCart = await prisma.customerCart.findUnique({ where: { email: identity.key } });
      if (savedCart) {
        cart = normalizeCartItems(savedCart.items);
      } else {
        cart = normalizeCartItems(store[identity.key] || store[user.email] || store[`guest:${identity.guestId}`] || []);
        if (cart.length) {
          await prisma.customerCart.create({ data: { email: identity.key, items: cart } });
        }
      }
    } catch (error) {
      console.error('Não foi possível carregar o carrinho salvo do cliente:', error);
      return Response.json({ error: 'Não foi possível carregar seu carrinho.' }, { status: 500, headers: responseHeaders(request, identity.guestId) });
    }
  }

  return Response.json({ cart }, { headers: responseHeaders(request, identity.guestId) });
}

export async function PUT(request) {
  const user = await getUser();
  const body = await request.json();
  const cart = normalizeCartItems(body?.cart);
  const identity = cartIdentity(request, user);
  if (user?.email) {
    try {
      await prisma.customerCart.upsert({
        where: { email: identity.key },
        create: { email: identity.key, items: cart },
        update: { items: cart },
      });
    } catch (error) {
      console.error('Não foi possível salvar o carrinho do cliente:', error);
      return Response.json({ error: 'Não foi possível salvar seu carrinho.' }, { status: 500, headers: responseHeaders(request, identity.guestId) });
    }
  } else {
    const store = await readStore();
    await writeStore({ ...store, [identity.key]: cart });
  }
  return Response.json({ cart }, { headers: responseHeaders(request, identity.guestId) });
}
