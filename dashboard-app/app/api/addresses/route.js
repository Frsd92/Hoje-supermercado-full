import { promises as fs } from 'fs';
import path from 'path';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';

const dataDirectory = path.join(process.cwd(), 'data');
const dataFile = path.join(dataDirectory, 'addresses.json');
const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);

function headers(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:5500',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    Vary: 'Origin',
  };
}

async function readStore() {
  try { return JSON.parse(await fs.readFile(dataFile, 'utf8')); } catch { return {}; }
}

async function getEmail() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.toLowerCase() || '';
}

function normalizeAddress(address) {
  const legacyCity = String(address.city || '').trim();
  let city = legacyCity;
  let neighborhood = String(address.neighborhood || '').trim();

  if (!neighborhood) {
    const separator = city.indexOf(',');
    if (separator !== -1) {
      neighborhood = city.slice(0, separator).trim();
      city = city.slice(separator + 1).trim();
    }
  }

  const stateSuffix = city.match(/^(.*?)\s+-\s+([A-Z]{2})$/i);
  if (stateSuffix) city = stateSuffix[1].trim();

  return {
    ...address,
    number: address.number || '',
    neighborhood,
    city,
    state: address.state || stateSuffix?.[2]?.toUpperCase() || '',
    country: address.country || (address.cep ? 'Brasil' : ''),
  };
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function GET(request) {
  const email = await getEmail();
  if (!email) return Response.json({ addresses: [] }, { headers: headers(request) });
  const store = await readStore();
  return Response.json({ addresses: (store[email] || []).map(normalizeAddress) }, { headers: headers(request) });
}

export async function PUT(request) {
  const email = await getEmail();
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401, headers: headers(request) });
  const body = await request.json();
  const addresses = Array.isArray(body?.addresses) ? body.addresses : [];
  const store = await readStore();
  await fs.mkdir(dataDirectory, { recursive: true });
  await fs.writeFile(dataFile, JSON.stringify({ ...store, [email]: addresses }, null, 2), 'utf8');
  return Response.json({ addresses }, { headers: headers(request) });
}