import 'server-only';
import { prisma } from '@/lib/prisma';
import { blingRequest, BlingIntegrationError } from './bling.js';
import { buildBlingProductPayload } from './bling-product-payload.js';
import { validateActiveNcm } from './product-ncm.js';

const maximumBlingErrorLength = 500;

function exactProducts(result, code) {
  return (Array.isArray(result?.data) ? result.data : [])
    .filter((product) => String(product.codigo || '').trim() === code);
}

async function findBlingProductByCode(code) {
  const query = new URLSearchParams({ pagina: '1', limite: '100', codigo: code });
  return exactProducts(await blingRequest(`/produtos?${query}`), code);
}

async function persistSyncResult(productId, update) {
  return prisma.product.update({
    where: { id: productId },
    data: update,
    select: {
      id: true,
      blingProductId: true,
      blingSyncStatus: true,
      blingSyncError: true,
      blingSyncedAt: true,
    },
  });
}

export async function syncProductToBling(productId) {
  const product = await prisma.product.findFirst({
    where: { OR: [{ id: productId }, { externalId: productId }] },
    include: { productBarcodes: { select: { code: true } } },
  });
  if (!product) throw new BlingIntegrationError('Produto não encontrado para sincronização.', 404);
  const staleSyncTime = new Date(Date.now() - 120_000);
  if (product.blingSyncStatus === 'syncing' && product.blingSyncStartedAt > staleSyncTime) {
    return {
      status: 'syncing',
      error: 'A sincronização deste produto já está em andamento.',
      blingProductId: product.blingProductId,
    };
  }

  const claim = await prisma.product.updateMany({
    where: {
      id: product.id,
      OR: [
        { blingSyncStatus: { not: 'syncing' } },
        { blingSyncStartedAt: null },
        { blingSyncStartedAt: { lte: staleSyncTime } },
      ],
    },
    data: {
      blingSyncStatus: 'syncing',
      blingSyncError: null,
      blingSyncStartedAt: new Date(),
    },
  });
  if (claim.count === 0) {
    return {
      status: 'syncing',
      error: 'A sincronização deste produto já está em andamento.',
      blingProductId: product.blingProductId,
    };
  }

  let createAccepted = false;
  try {
    const origin = process.env.NEXTAUTH_URL || process.env.BLING_REDIRECT_URI || '';
    let payloadData;
    try {
      payloadData = buildBlingProductPayload(product, { origin });
    } catch (error) {
      if (error instanceof Error) throw new BlingIntegrationError(error.message, 422);
      throw error;
    }
    const { payload, code, warnings } = payloadData;
    const ncm = String(product.metadata?.ncm || '').replace(/\D/g, '');
    if (ncm) {
      const validation = await validateActiveNcm(ncm);
      if (!validation.valid) throw new BlingIntegrationError(`O NCM do produto não está vigente na tabela oficial: ${validation.error}`, 422);
    }

    let blingProductId = product.blingProductId;
    let existingProducts = [];
    if (!blingProductId) {
      existingProducts = await findBlingProductByCode(code);
      if (existingProducts.length > 1) {
        throw new BlingIntegrationError('Há vários produtos com este código no Bling. Resolva as duplicidades antes de sincronizar.', 409);
      }
      if (existingProducts.length === 1) {
        blingProductId = existingProducts[0].id;
        if (!blingProductId) {
          throw new BlingIntegrationError('O Bling encontrou um produto com este código, mas não retornou seu ID. Confira o cadastro antes de tentar novamente.', 502, { uncertain: true });
        }
      }
      if (['uncertain', 'syncing'].includes(product.blingSyncStatus) && !blingProductId) {
        throw new BlingIntegrationError('A tentativa anterior teve resultado incerto e o produto não foi localizado. Confira no Bling antes de autorizar uma nova criação.', 409, { uncertain: true });
      }
    }

    let result;
    if (blingProductId) {
      result = await blingRequest(`/produtos/${encodeURIComponent(blingProductId)}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
    } else {
      result = await blingRequest('/produtos', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      createAccepted = true;
    }
    blingProductId = result?.data?.id || blingProductId;
    if (!blingProductId) {
      const matches = await findBlingProductByCode(code);
      if (matches.length === 1) blingProductId = matches[0].id;
    }
    if (!blingProductId) {
      throw new BlingIntegrationError('O Bling aceitou a operação, mas não retornou o ID do produto. Confira o código no Bling antes de tentar novamente.', 502, { uncertain: true });
    }

    const warning = warnings.join(' ');
    const status = warning ? 'partial' : 'synced';
    const saved = await persistSyncResult(product.id, {
      blingProductId: String(blingProductId),
      blingSyncStatus: status,
      blingSyncError: warning,
      blingSyncedAt: new Date(),
      blingSyncStartedAt: null,
    });
    return {
      status: saved.blingSyncStatus,
      error: saved.blingSyncError,
      blingProductId: saved.blingProductId,
      syncedAt: saved.blingSyncedAt?.toISOString() || null,
    };
  } catch (error) {
    const uncertain = (error instanceof BlingIntegrationError && error.uncertain)
      || (createAccepted && !product.blingProductId);
    const message = String(error?.message || 'Não foi possível sincronizar o produto com o Bling.').slice(0, maximumBlingErrorLength);
    const saved = await persistSyncResult(product.id, {
      blingSyncStatus: uncertain ? 'uncertain' : 'failed',
      blingSyncError: message,
      blingSyncStartedAt: null,
    });
    return {
      status: saved.blingSyncStatus,
      error: saved.blingSyncError,
      blingProductId: saved.blingProductId,
    };
  }
}
