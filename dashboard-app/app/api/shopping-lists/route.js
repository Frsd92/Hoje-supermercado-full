import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasCustomerDashboardAccess } from '@/features/auth/access';
import {
  MAX_SHOPPING_LISTS,
  normalizeShoppingListItems,
  normalizeShoppingListName,
} from '@/features/shopping/shopping-list-validation';
import { prisma } from '@/lib/prisma';

async function getCustomer() {
  const session = await getServerSession(authOptions);
  if (!hasCustomerDashboardAccess(session?.user)) return null;
  const email = String(session.user.email || '').trim().toLowerCase();
  if (!email) return null;
  return prisma.user.upsert({
    where: { email },
    create: { email, name: session.user.name || null, image: session.user.image || null },
    update: {
      name: session.user.name || undefined,
      image: session.user.image || undefined,
    },
  });
}

async function parseBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function serializedList(list) {
  return {
    id: list.id,
    name: list.name,
    items: Array.isArray(list.items) ? list.items : [],
    createdAt: list.createdAt.toISOString(),
    updatedAt: list.updatedAt.toISOString(),
  };
}

export async function GET() {
  let customer;
  try {
    customer = await getCustomer();
    if (!customer) return Response.json({ error: 'Login necessário.' }, { status: 401 });
    const lists = await prisma.customerShoppingList.findMany({
      where: { userId: customer.id },
      orderBy: { updatedAt: 'desc' },
    });
    return Response.json({ lists: lists.map(serializedList) }, {
      headers: { 'Cache-Control': 'private, no-store, max-age=0' },
    });
  } catch (error) {
    console.error('Não foi possível carregar as listas de compras do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar suas listas agora.' }, { status: 500 });
  }
}

export async function POST(request) {
  let customer;
  try {
    customer = await getCustomer();
    if (!customer) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  } catch (error) {
    console.error('Não foi possível identificar o cliente para criar uma lista:', error);
    return Response.json({ error: 'Não foi possível criar esta lista agora.' }, { status: 500 });
  }

  const body = await parseBody(request);
  const name = normalizeShoppingListName(body?.name);
  const items = body?.items === undefined ? [] : normalizeShoppingListItems(body.items);
  if (!name || !items) {
    return Response.json({ error: 'Informe um nome e itens válidos para a lista.' }, { status: 400 });
  }

  try {
    const count = await prisma.customerShoppingList.count({ where: { userId: customer.id } });
    if (count >= MAX_SHOPPING_LISTS) {
      return Response.json({ error: `Você pode salvar até ${MAX_SHOPPING_LISTS} listas.` }, { status: 409 });
    }
    const list = await prisma.customerShoppingList.create({
      data: { userId: customer.id, name, items },
    });
    return Response.json({ list: serializedList(list) }, { status: 201 });
  } catch (error) {
    console.error('Não foi possível criar uma lista de compras no banco de dados:', error);
    return Response.json({ error: 'Não foi possível criar esta lista agora.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  let customer;
  try {
    customer = await getCustomer();
    if (!customer) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  } catch (error) {
    console.error('Não foi possível identificar o cliente para atualizar uma lista:', error);
    return Response.json({ error: 'Não foi possível atualizar esta lista agora.' }, { status: 500 });
  }

  const body = await parseBody(request);
  const id = typeof body?.id === 'string' ? body.id.trim() : '';
  if (!id) return Response.json({ error: 'Identificador da lista obrigatório.' }, { status: 400 });
  const hasName = Object.hasOwn(body, 'name');
  const hasItems = Object.hasOwn(body, 'items');
  const name = hasName ? normalizeShoppingListName(body.name) : undefined;
  const items = hasItems ? normalizeShoppingListItems(body.items) : undefined;
  if ((!hasName && !hasItems) || (hasName && !name) || (hasItems && !items)) {
    return Response.json({ error: 'Informe alterações válidas para a lista.' }, { status: 400 });
  }

  try {
    const result = await prisma.customerShoppingList.updateMany({
      where: { id, userId: customer.id },
      data: { ...(hasName ? { name } : {}), ...(hasItems ? { items } : {}) },
    });
    if (!result.count) return Response.json({ error: 'Lista não encontrada.' }, { status: 404 });
    const list = await prisma.customerShoppingList.findFirst({ where: { id, userId: customer.id } });
    return Response.json({ list: serializedList(list) });
  } catch (error) {
    console.error('Não foi possível atualizar uma lista de compras no banco de dados:', error);
    return Response.json({ error: 'Não foi possível atualizar esta lista agora.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  let customer;
  try {
    customer = await getCustomer();
    if (!customer) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  } catch (error) {
    console.error('Não foi possível identificar o cliente para excluir uma lista:', error);
    return Response.json({ error: 'Não foi possível excluir esta lista agora.' }, { status: 500 });
  }

  const id = new URL(request.url).searchParams.get('id')?.trim() || '';
  if (!id) return Response.json({ error: 'Identificador da lista obrigatório.' }, { status: 400 });
  try {
    const result = await prisma.customerShoppingList.deleteMany({ where: { id, userId: customer.id } });
    if (!result.count) return Response.json({ error: 'Lista não encontrada.' }, { status: 404 });
    return Response.json({ success: true });
  } catch (error) {
    console.error('Não foi possível excluir uma lista de compras do banco de dados:', error);
    return Response.json({ error: 'Não foi possível excluir esta lista agora.' }, { status: 500 });
  }
}
