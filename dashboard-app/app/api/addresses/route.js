import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import {
  getServiceRegionError,
  getServiceRegionMatch,
  normalizeSavedAddress,
  sameDeliveryRegion,
} from '@/features/service-regions/region-utils';
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
  const optionalFields = ['number', 'neighborhood', 'state', 'stateCode', 'country', 'type'];
  return requiredFields.every((field) => typeof address[field] === 'string' && address[field].trim())
    && optionalFields.every((field) => address[field] === undefined || typeof address[field] === 'string');
}

function getRegionStates() {
  return prisma.serviceRegionState.findMany({
    include: { municipalities: true },
    orderBy: { name: 'asc' },
  });
}

export async function OPTIONS(request) {
  return new Response(null, { status: 204, headers: headers(request) });
}

export async function GET(request) {
  const email = await getEmail();
  if (!email) return Response.json({ addresses: [] }, { headers: headers(request) });

  try {
    const [addressBook, regions] = await Promise.all([
      prisma.customerAddressBook.findUnique({ where: { email } }),
      getRegionStates(),
    ]);
    const savedAddresses = addressBook?.addresses ?? [];
    if (!Array.isArray(savedAddresses)) throw new Error('Os endereços armazenados possuem um formato inválido.');

    return Response.json({ addresses: savedAddresses.map((address) => normalizeSavedAddress(address, regions)) }, { headers: headers(request) });
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

  try {
    const [regions, currentAddressBook] = await Promise.all([
      getRegionStates(),
      prisma.customerAddressBook.findUnique({ where: { email } }),
    ]);
    const currentAddresses = currentAddressBook?.addresses ?? [];
    if (!Array.isArray(currentAddresses)) throw new Error('Os endereços armazenados possuem um formato inválido.');

    const previousById = new Map(currentAddresses
      .filter((address) => address && typeof address === 'object' && !Array.isArray(address))
      .map((address) => [String(address.id), normalizeSavedAddress(address, regions)]));
    const addresses = body.addresses.map((address) => normalizeSavedAddress(address, regions));

    for (const address of addresses) {
      const previous = previousById.get(String(address.id));
      if (previous && sameDeliveryRegion(previous, address)) continue;

      const match = getServiceRegionMatch(address, regions);
      if (!match.allowed) {
        return Response.json(
          {
            error: getServiceRegionError(address, match, regions),
            code: 'SERVICE_AREA_UNAVAILABLE',
          },
          { status: 422, headers: headers(request) },
        );
      }
    }

    const addressBook = await prisma.customerAddressBook.upsert({
      where: { email },
      create: { email, addresses },
      update: { addresses },
      select: { addresses: true },
    });
    if (!Array.isArray(addressBook.addresses)) throw new Error('O banco não confirmou a lista de endereços.');

    return Response.json({ addresses: addressBook.addresses.map((address) => normalizeSavedAddress(address, regions)) }, { headers: headers(request) });
  } catch (error) {
    console.error('Não foi possível salvar os endereços do cliente:', error);
    return Response.json(
      { error: 'Não foi possível salvar os endereços. Tente novamente.' },
      { status: 500, headers: headers(request) },
    );
  }
}
