import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const dataDirectory = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDirectory, 'favorites.json');

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

async function readStore() {
  try {
    const content = await fs.readFile(dataFile, 'utf8');
    return JSON.parse(content);
  } catch {
    return {};
  }
}

async function writeStore(store) {
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify(store, null, 2), 'utf8');
}

function response(data, status, request) {
  return Response.json(data, {
    status,
    headers: corsHeaders(request),
  });
}

async function getAuthenticatedUser() {
  const session = await getServerSession(authOptions);
  return session?.user || null;
}

function getUserKey(user) {
  return user.email || user.name || 'cliente';
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function GET(request) {
  const user = await getAuthenticatedUser();
  if (!user) return response({ error: 'Login necessário.', favorites: [] }, 401, request);

  const store = await readStore();
  return response({ favorites: store[getUserKey(user)] || [] }, 200, request);
}

export async function POST(request) {
  const user = await getAuthenticatedUser();
  if (!user) return response({ error: 'Login necessário.' }, 401, request);

  const body = await request.json();
  const favorite = body?.favorite;

  if (!favorite?.name) {
    return response({ error: 'Favorito inválido.' }, 400, request);
  }

  const store = await readStore();
  const userKey = getUserKey(user);
  const favorites = store[userKey] || [];
  const withoutDuplicate = favorites.filter((item) => item.name !== favorite.name);
  const nextFavorites = [...withoutDuplicate, favorite];
  await writeStore({ ...store, [userKey]: nextFavorites });

  return response({ favorites: nextFavorites }, 201, request);
}

export async function DELETE(request) {
  const user = await getAuthenticatedUser();
  if (!user) return response({ error: 'Login necessário.' }, 401, request);

  const body = await request.json();
  const name = body?.name;

  if (!name) {
    return response({ error: 'Nome do favorito é obrigatório.' }, 400, request);
  }

  const store = await readStore();
  const userKey = getUserKey(user);
  const favorites = (store[userKey] || []).filter((item) => item.name !== name);
  await writeStore({ ...store, [userKey]: favorites });

  return response({ favorites }, 200, request);
}
