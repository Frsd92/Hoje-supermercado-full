import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

const allowedOrigins = new Set([
  'http://localhost:8010',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
  'null',
]);

function corsHeaders(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:8010',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

function response(data, status, request) {
  return Response.json(data, { status, headers: corsHeaders(request) });
}

async function getCustomer() {
  const session = await getServerSession(authOptions);
  const email = String(session?.user?.email || '').trim().toLowerCase();
  if (!email) return null;

  return prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: session.user.name || null,
      image: session.user.image || null,
    },
    update: {
      name: session.user.name || undefined,
      image: session.user.image || undefined,
    },
  });
}

function serializeFavorite(favorite) {
  const product = favorite.product;
  const metadata = product.metadata && typeof product.metadata === 'object' && !Array.isArray(product.metadata)
    ? product.metadata
    : {};
  const price = Number(product.price);

  return {
    id: product.externalId || product.id,
    productId: product.externalId || product.id,
    name: product.title,
    category: product.subcategory || product.categories[0] || 'Sem categoria',
    price: Number.isFinite(price) ? `R$ ${price.toFixed(2).replace('.', ',')}` : 'R$ 0,00',
    image: product.image || '',
    saleUnit: metadata.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
  };
}

async function listFavorites(userId) {
  const favorites = await prisma.favorite.findMany({
    where: { userId },
    include: {
      product: {
        select: {
          id: true,
          externalId: true,
          title: true,
          price: true,
          subcategory: true,
          categories: true,
          image: true,
          metadata: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });
  return favorites.map(serializeFavorite);
}

async function parseBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

async function findProduct(identifier) {
  return prisma.product.findFirst({
    where: {
      OR: [{ id: identifier }, { externalId: identifier }],
    },
    select: { id: true, status: true },
  });
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  try {
    const customer = await getCustomer();
    if (!customer) return response({ error: 'Login necessário.', favorites: [] }, 401, request);
    return response({ favorites: await listFavorites(customer.id) }, 200, request);
  } catch (error) {
    console.error('Não foi possível carregar os favoritos do banco de dados:', error);
    return response({ error: 'Não foi possível carregar seus favoritos agora.' }, 500, request);
  }
}

export async function POST(request) {
  let customer;
  try {
    customer = await getCustomer();
  } catch (error) {
    console.error('Não foi possível identificar o cliente para salvar o favorito:', error);
    return response({ error: 'Não foi possível salvar este favorito agora.' }, 500, request);
  }
  if (!customer) return response({ error: 'Login necessário.' }, 401, request);

  const body = await parseBody(request);
  const identifier = String(body?.favorite?.productId || body?.favorite?.id || '').trim();
  if (!identifier) return response({ error: 'Identificador do produto favorito inválido.' }, 400, request);

  try {
    const product = await findProduct(identifier);
    if (!product || product.status !== 'Ativo') {
      return response({ error: 'Este produto não está disponível no catálogo.' }, 404, request);
    }

    await prisma.favorite.upsert({
      where: { userId_productId: { userId: customer.id, productId: product.id } },
      create: { userId: customer.id, productId: product.id },
      update: {},
    });

    return response({ favorites: await listFavorites(customer.id) }, 200, request);
  } catch (error) {
    console.error('Não foi possível salvar o favorito no banco de dados:', error);
    return response({ error: 'Não foi possível salvar este favorito agora.' }, 500, request);
  }
}

export async function DELETE(request) {
  let customer;
  try {
    customer = await getCustomer();
  } catch (error) {
    console.error('Não foi possível identificar o cliente para remover o favorito:', error);
    return response({ error: 'Não foi possível remover este favorito agora.' }, 500, request);
  }
  if (!customer) return response({ error: 'Login necessário.' }, 401, request);

  const body = await parseBody(request);
  const identifier = String(body?.productId || body?.id || '').trim();
  if (!identifier) return response({ error: 'Identificador do produto favorito obrigatório.' }, 400, request);

  try {
    const product = await findProduct(identifier);
    if (product) {
      await prisma.favorite.deleteMany({
        where: { userId: customer.id, productId: product.id },
      });
    }

    return response({ favorites: await listFavorites(customer.id) }, 200, request);
  } catch (error) {
    console.error('Não foi possível remover o favorito do banco de dados:', error);
    return response({ error: 'Não foi possível remover este favorito agora.' }, 500, request);
  }
}
