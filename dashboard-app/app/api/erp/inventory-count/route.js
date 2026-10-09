import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { getProductCatalog } from '@/features/erp/api/product-catalog';
import { inventoryQuantityMilliUnits } from '@/features/erp/api/inventory-lots';
import {
  getInventoryCountCategory,
  getInventoryCountSourceCategory,
} from '@/features/erp/inventory-count-categories';
import { prisma } from '@/lib/prisma';

const responseHeaders = { 'Cache-Control': 'private, no-store, max-age=0' };
const ACTIVE_COUNT_KEY = 'ACTIVE';
const MAX_QUANTITY_MILLI_UNITS = 999_999_999_999;

class InventoryCountRequestError extends Error {
  constructor(message, status = 400, code = '') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

function serializeItem(item) {
  return {
    id: item.id,
    productId: item.productId,
    productTitle: item.productTitle,
    productSku: item.productSku || '',
    productBarcode: item.productBarcode || '',
    productStatus: item.productStatus,
    category: item.category,
    sourceCategory: item.sourceCategory,
    unit: item.unit,
    systemQuantity: Number(item.systemQuantity),
    countedQuantity: item.countedQuantity === null ? null : Number(item.countedQuantity),
    countedAt: item.countedAt?.toISOString() || null,
  };
}

function serializeCount(count) {
  if (!count) return null;
  return {
    id: count.id,
    status: count.status,
    createdBy: count.createdBy,
    createdAt: count.createdAt.toISOString(),
    completedBy: count.completedBy || '',
    completedAt: count.completedAt?.toISOString() || null,
    items: count.items.map(serializeItem),
  };
}

function serializeCountSummary(count) {
  return {
    id: count.id,
    status: count.status,
    createdBy: count.createdBy,
    createdAt: count.createdAt.toISOString(),
    completedBy: count.completedBy || '',
    completedAt: count.completedAt?.toISOString() || null,
  };
}

async function getAuthorizedUser() {
  const session = await getServerSession(authOptions);
  return hasErpAccess(session?.user) ? session.user : null;
}

function createSnapshotItem(product) {
  const quantityMilliUnits = inventoryQuantityMilliUnits(product?.quantity ?? 0);
  if (quantityMilliUnits === null || quantityMilliUnits > MAX_QUANTITY_MILLI_UNITS) {
    throw new InventoryCountRequestError(`O estoque online de "${product?.title || 'um produto'}" não possui uma quantidade válida.`, 409);
  }

  const status = String(product?.status || 'Ativo');
  if (status !== 'Ativo' && quantityMilliUnits === 0) return null;

  const productId = String(product?.id || '').trim();
  const productTitle = String(product?.title || '').trim();
  if (!productId || !productTitle) {
    throw new InventoryCountRequestError('Há um produto sem identificação válida no catálogo. Corrija o cadastro antes de iniciar o balanço.', 409);
  }

  const saleUnit = String(product?.saleUnit || '').trim().toLocaleLowerCase('pt-BR');
  return {
    productId,
    productTitle,
    productSku: String(product?.sku || '').trim() || null,
    productBarcode: String(product?.barcode || '').trim() || null,
    productStatus: status,
    category: getInventoryCountCategory(product),
    sourceCategory: getInventoryCountSourceCategory(product),
    unit: saleUnit === 'kg' || saleUnit === 'quilograma' ? 'kg' : 'un.',
    systemQuantity: quantityMilliUnits / 1000,
  };
}

export async function GET(request) {
  if (!(await getAuthorizedUser())) {
    return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: responseHeaders });
  }

  try {
    const requestedId = new URL(request.url).searchParams.get('id')?.trim();
    const [activeCount, history] = await Promise.all([
      prisma.inventoryCount.findFirst({
        where: { activeKey: ACTIVE_COUNT_KEY },
        select: { id: true },
      }),
      prisma.inventoryCount.findMany({
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          status: true,
          createdBy: true,
          createdAt: true,
          completedBy: true,
          completedAt: true,
        },
      }),
    ]);

    let count;
    if (requestedId) {
      count = await prisma.inventoryCount.findUnique({
        where: { id: requestedId },
        include: { items: { orderBy: [{ category: 'asc' }, { productTitle: 'asc' }] } },
      });
      if (!count) return Response.json({ error: 'Balanço não encontrado.' }, { status: 404, headers: responseHeaders });
    } else if (activeCount) {
      count = await prisma.inventoryCount.findUnique({
        where: { id: activeCount.id },
        include: { items: { orderBy: [{ category: 'asc' }, { productTitle: 'asc' }] } },
      });
    } else {
      count = await prisma.inventoryCount.findFirst({
        where: { status: 'COMPLETED' },
        orderBy: { createdAt: 'desc' },
        include: { items: { orderBy: [{ category: 'asc' }, { productTitle: 'asc' }] } },
      });
    }

    return Response.json({
      count: serializeCount(count),
      activeCountId: activeCount?.id || '',
      history: history.map(serializeCountSummary),
    }, { headers: responseHeaders });
  } catch (error) {
    console.error('Não foi possível carregar o balanço de estoque:', error);
    return Response.json({ error: 'Não foi possível carregar o balanço de estoque.' }, { status: 500, headers: responseHeaders });
  }
}

export async function POST() {
  const user = await getAuthorizedUser();
  if (!user) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: responseHeaders });

  try {
    const count = await prisma.$transaction(async (transaction) => {
      const products = await getProductCatalog(transaction);
      const items = products.map(createSnapshotItem).filter(Boolean);
      if (!items.length) {
        throw new InventoryCountRequestError('Não há produtos disponíveis para iniciar o balanço.', 409);
      }

      const activeCount = await transaction.inventoryCount.findFirst({
        where: { activeKey: ACTIVE_COUNT_KEY },
        select: { id: true },
      });
      if (activeCount) {
        throw new InventoryCountRequestError('Já existe um balanço em andamento. Atualize a tela para retomá-lo.', 409, 'ACTIVE_COUNT_EXISTS');
      }

      const created = await transaction.inventoryCount.create({
        data: {
          activeKey: ACTIVE_COUNT_KEY,
          status: 'OPEN',
          createdBy: erpActorLabel(user),
        },
      });
      await transaction.inventoryCountItem.createMany({
        data: items.map((item) => ({ ...item, countId: created.id })),
      });
      return created;
    }, { isolationLevel: 'Serializable' });

    return Response.json({ countId: count.id }, { status: 201, headers: responseHeaders });
  } catch (error) {
    if (error instanceof InventoryCountRequestError) {
      return Response.json({
        error: error.message,
        ...(error.code ? { code: error.code } : {}),
      }, { status: error.status, headers: responseHeaders });
    }
    if (error?.code === 'P2002' || error?.code === 'P2034') {
      return Response.json({
        error: 'Outro usuário iniciou um balanço ao mesmo tempo. Atualize a tela para continuar.',
        code: 'ACTIVE_COUNT_EXISTS',
      }, { status: 409, headers: responseHeaders });
    }
    console.error('Não foi possível iniciar o balanço de estoque:', error);
    return Response.json({ error: 'Não foi possível iniciar o balanço de estoque.' }, { status: 500, headers: responseHeaders });
  }
}

export async function PATCH(request) {
  const user = await getAuthorizedUser();
  if (!user) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers: responseHeaders });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers: responseHeaders });
  }

  const countId = String(body?.countId || '').trim();
  if (!countId) return Response.json({ error: 'Informe o balanço que será atualizado.' }, { status: 400, headers: responseHeaders });

  try {
    if (body?.action === 'save') {
      if (!Array.isArray(body.items) || !body.items.length) {
        return Response.json({ error: 'Informe ao menos uma contagem para salvar.' }, { status: 400, headers: responseHeaders });
      }

      const changes = [];
      const itemIds = new Set();
      for (const item of body.items) {
        const id = String(item?.id || '').trim();
        if (!id || itemIds.has(id)) {
          return Response.json({ error: 'A lista de produtos da contagem é inválida.' }, { status: 400, headers: responseHeaders });
        }
        itemIds.add(id);

        if (item.countedQuantity === null) {
          changes.push({ id, quantityMilliUnits: null });
          continue;
        }
        if (item.countedQuantity === undefined || item.countedQuantity === '') {
          return Response.json({ error: 'Informe uma quantidade física válida ou deixe o campo em branco para limpar a contagem.' }, { status: 400, headers: responseHeaders });
        }
        const quantityMilliUnits = inventoryQuantityMilliUnits(item.countedQuantity);
        if (quantityMilliUnits === null || quantityMilliUnits > MAX_QUANTITY_MILLI_UNITS) {
          return Response.json({ error: 'A quantidade física deve ser positiva ou zero, com até três casas decimais.' }, { status: 400, headers: responseHeaders });
        }
        changes.push({ id, quantityMilliUnits });
      }

      await prisma.$transaction(async (transaction) => {
        const count = await transaction.inventoryCount.findUnique({
          where: { id: countId },
          select: { activeKey: true },
        });
        if (!count) throw new InventoryCountRequestError('Balanço não encontrado.', 404);
        if (count.activeKey !== ACTIVE_COUNT_KEY) {
          throw new InventoryCountRequestError('Este balanço já foi concluído e não pode ser alterado.', 409);
        }

        const existingItems = await transaction.inventoryCountItem.findMany({
          where: { countId, id: { in: [...itemIds] } },
          select: { id: true },
        });
        if (existingItems.length !== itemIds.size) {
          throw new InventoryCountRequestError('Um ou mais produtos não pertencem a este balanço.', 400);
        }

        const countedAt = new Date();
        for (const change of changes) {
          await transaction.inventoryCountItem.update({
            where: { id: change.id },
            data: {
              countedQuantity: change.quantityMilliUnits === null ? null : change.quantityMilliUnits / 1000,
              countedAt: change.quantityMilliUnits === null ? null : countedAt,
            },
          });
        }
      }, { isolationLevel: 'Serializable' });

      return Response.json({ success: true }, { headers: responseHeaders });
    }

    if (body?.action === 'complete') {
      await prisma.$transaction(async (transaction) => {
        const count = await transaction.inventoryCount.findUnique({
          where: { id: countId },
          select: { activeKey: true },
        });
        if (!count) throw new InventoryCountRequestError('Balanço não encontrado.', 404);
        if (count.activeKey !== ACTIVE_COUNT_KEY) {
          throw new InventoryCountRequestError('Este balanço já foi concluído.', 409);
        }

        const remainingItems = await transaction.inventoryCountItem.count({
          where: { countId, countedQuantity: null },
        });
        if (remainingItems > 0) {
          throw new InventoryCountRequestError(`Ainda faltam ${remainingItems.toLocaleString('pt-BR')} produtos para contar. Informe zero nos itens sem estoque físico.`, 409);
        }

        await transaction.inventoryCount.update({
          where: { id: countId },
          data: {
            activeKey: null,
            status: 'COMPLETED',
            completedBy: erpActorLabel(user),
            completedAt: new Date(),
          },
        });
      }, { isolationLevel: 'Serializable' });

      return Response.json({ success: true }, { headers: responseHeaders });
    }

    return Response.json({ error: 'Ação de balanço inválida.' }, { status: 400, headers: responseHeaders });
  } catch (error) {
    if (error instanceof InventoryCountRequestError) {
      return Response.json({ error: error.message }, { status: error.status, headers: responseHeaders });
    }
    if (error?.code === 'P2034') {
      return Response.json({ error: 'O balanço foi alterado por outra pessoa. Atualize os dados antes de tentar novamente.' }, { status: 409, headers: responseHeaders });
    }
    console.error('Não foi possível atualizar o balanço de estoque:', error);
    return Response.json({ error: 'Não foi possível atualizar o balanço de estoque.' }, { status: 500, headers: responseHeaders });
  }
}
