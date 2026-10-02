import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';

const allowedOrigins = new Set(['http://localhost:8010', 'http://localhost:5500', 'http://127.0.0.1:5500', 'null']);

function headers(request) {
  const origin = request.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigins.has(origin) ? origin : 'http://localhost:5500',
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    Vary: 'Origin',
  };
}

async function getEmail() {
  const session = await getServerSession(authOptions);
  return session?.user?.email?.trim().toLowerCase() || '';
}

function isAddress(address) {
  if (!address || typeof address !== 'object' || Array.isArray(address)) return false;
  const requiredFields = ['id', 'title', 'street', 'city', 'cep'];
  const optionalFields = ['number', 'neighborhood', 'state', 'country', 'type'];
  return requiredFields.every((field) => typeof address[field] === 'string' && address[field].trim())
    && optionalFields.every((field) => address[field] === undefined || typeof address[field] === 'string');
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

  try {
    const addressBook = await prisma.customerAddressBook.findUnique({ where: { email } });
    const savedAddresses = addressBook?.addresses ?? [];
    if (!Array.isArray(savedAddresses)) throw new Error('Os endereços armazenados possuem um formato inválido.');

    return Response.json({ addresses: savedAddresses.map(normalizeAddress) }, { headers: headers(request) });
  } catch (error) {
    console.error('Não foi possível carregar os endereços do cliente:', error);
    return Response.json(
      { error: 'Não foi possível carregar seus endereços.' },
      { status: 500, headers: headers(request) },
    );
  }
}

export async function PUT(request) {
  const email = await getEmail();
  if (!email) {
    return Response.json({ error: 'Login necessário.' }, { status: 401, headers: headers(request) });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers: headers(request) });
  }

  if (!Array.isArray(body?.addresses) || !body.addresses.every(isAddress)) {
    return Response.json({ error: 'A lista de endereços enviada é inválida.' }, { status: 400, headers: headers(request) });
  }

  const addresses = body.addresses.map(normalizeAddress);
  try {
    const addressBook = await prisma.customerAddressBook.upsert({
      where: { email },
      create: { email, addresses },
      update: { addresses },
      select: { addresses: true },
    });
    if (!Array.isArray(addressBook.addresses)) throw new Error('O banco não confirmou a lista de endereços.');

    return Response.json({ addresses: addressBook.addresses.map(normalizeAddress) }, { headers: headers(request) });
  } catch (error) {
    console.error('Não foi possível salvar os endereços do cliente:', error);
    return Response.json(
      { error: 'Não foi possível salvar os endereços. Tente novamente.' },
      { status: 500, headers: headers(request) },
    );
  }
}
