import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { normalizeCartItems } from '@/app/dashboard/cart-utils';
import { hasCustomerDashboardAccess } from '@/features/auth/access';
import { latestCartActivityAt, mergeCartItems, normalizeGuestCartId } from '@/features/cart/cart-storage';
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

async function getUser() {
  const session = await getServerSession(authOptions);
  return hasCustomerDashboardAccess(session?.user) ? session.user : null;
}

function userKey(user) {
  return user.email?.trim().toLowerCase() || user.name || 'cliente';
}

function readCookie(request, name) {
  const cookies = request.headers.get('cookie') || '';
  const value = cookies.split(';').map((cookie) => cookie.trim()).find((cookie) => cookie.startsWith(`${name}=`));
  if (!value) return '';
  try {
    return decodeURIComponent(value.slice(name.length + 1));
  } catch {
    return '';
  }
}

function cartIdentity(request, user) {
  const guestId = normalizeGuestCartId(request.headers.get('x-hoje-cart-id'))
    || normalizeGuestCartId(readCookie(request, 'hoje-cart-id'))
    || randomUUID();
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
  const identity = cartIdentity(request, user);
  try {
    const store = await readStore();
    if (user?.email) {
      const [savedCart, foundGuestCart] = await Promise.all([
        prisma.customerCart.findUnique({ where: { email: identity.key } }),
        prisma.guestCart.findUnique({ where: { id: identity.guestId } }),
      ]);
      const legacyGuestCart = foundGuestCart
        ? []
        : normalizeCartItems(store[`guest:${identity.guestId}`] || []);
      const savedGuestCart = foundGuestCart || (legacyGuestCart.length
        ? await prisma.guestCart.upsert({
          where: { id: identity.guestId },
          create: { id: identity.guestId, items: legacyGuestCart },
          update: {},
        })
        : null);
      const legacyCustomerCart = savedCart
        ? []
        : normalizeCartItems(store[identity.key] || store[user.email] || []);
      const guestCart = savedGuestCart
        ? normalizeCartItems(savedGuestCart.items)
        : legacyGuestCart;

      if (guestCart.length) {
        const result = await prisma.$transaction(async (transaction) => {
          const [latestCustomerCart, latestGuestCart] = await Promise.all([
            transaction.customerCart.findUnique({ where: { email: identity.key } }),
            transaction.guestCart.findUnique({ where: { id: identity.guestId } }),
          ]);
          const guestItems = latestGuestCart
            ? normalizeCartItems(latestGuestCart.items)
            : guestCart;
          if (guestItems.length && latestGuestCart) {
            const claim = await transaction.guestCart.updateMany({
              where: { id: identity.guestId, updatedAt: latestGuestCart.updatedAt },
              data: {
                items: [],
                updatedAt: new Date(Math.max(Date.now(), latestGuestCart.updatedAt.getTime() + 1)),
              },
            });
            if (claim.count !== 1) return { retry: true, cart: [] };
          }

          const customerItems = latestCustomerCart
            ? normalizeCartItems(latestCustomerCart.items)
            : legacyCustomerCart;
          const mergedCart = mergeCartItems(customerItems, guestItems);
          const mergedUpdatedAt = latestCartActivityAt(latestCustomerCart?.updatedAt, latestGuestCart?.updatedAt);

          if (guestItems.length) {
            await transaction.customerCart.upsert({
              where: { email: identity.key },
              create: { email: identity.key, items: mergedCart, updatedAt: mergedUpdatedAt },
              update: { items: mergedCart, updatedAt: mergedUpdatedAt },
            });
          }
          return { retry: false, cart: guestItems.length ? mergedCart : customerItems };
        });
        if (result.retry) {
          const latestCart = await prisma.customerCart.findUnique({ where: { email: identity.key } });
          return Response.json({ cart: normalizeCartItems(latestCart?.items) }, {
            headers: responseHeaders(request, identity.guestId),
          });
        }
        const cart = result.cart.length || savedCart
          ? result.cart
          : legacyCustomerCart;
        return Response.json({ cart }, { headers: responseHeaders(request, identity.guestId) });
      }

      const cart = savedCart
        ? normalizeCartItems(savedCart.items)
        : legacyCustomerCart;
      if (!savedCart && cart.length) {
        await prisma.customerCart.create({ data: { email: identity.key, items: cart } });
      }
      return Response.json({ cart }, { headers: responseHeaders(request, identity.guestId) });
    }

    const savedGuestCart = await prisma.guestCart.findUnique({ where: { id: identity.guestId } });
    if (savedGuestCart) {
      return Response.json({ cart: normalizeCartItems(savedGuestCart.items) }, {
        headers: responseHeaders(request, identity.guestId),
      });
    }

    const legacyCart = normalizeCartItems(store[identity.key] || []);
    if (legacyCart.length) {
      const migratedCart = await prisma.guestCart.upsert({
        where: { id: identity.guestId },
        create: { id: identity.guestId, items: legacyCart },
        update: {},
      });
      return Response.json({ cart: normalizeCartItems(migratedCart.items) }, {
        headers: responseHeaders(request, identity.guestId),
      });
    }

    return Response.json({ cart: [] }, { headers: responseHeaders(request, identity.guestId) });
  } catch (error) {
    console.error('Não foi possível carregar o carrinho salvo:', error);
    return Response.json({ error: 'Não foi possível carregar seu carrinho.' }, { status: 500, headers: responseHeaders(request, identity.guestId) });
  }
}

export async function PUT(request) {
  const user = await getUser();
  let body;
  try {
    body = await request.json();
  } catch {
    const identity = cartIdentity(request, user);
    return Response.json({ error: 'O conteúdo enviado não é um JSON válido.' }, { status: 400, headers: responseHeaders(request, identity.guestId) });
  }
  const cart = normalizeCartItems(body?.cart);
  const identity = cartIdentity(request, user);
  try {
    if (user?.email) {
      await prisma.customerCart.upsert({
        where: { email: identity.key },
        create: { email: identity.key, items: cart },
        update: { items: cart },
      });
    } else {
      await prisma.guestCart.upsert({
        where: { id: identity.guestId },
        create: { id: identity.guestId, items: cart },
        update: { items: cart },
      });
    }
  } catch (error) {
    console.error('Não foi possível salvar o carrinho:', error);
    return Response.json({ error: 'Não foi possível salvar seu carrinho.' }, { status: 500, headers: responseHeaders(request, identity.guestId) });
  }
  return Response.json({ cart }, { headers: responseHeaders(request, identity.guestId) });
}
