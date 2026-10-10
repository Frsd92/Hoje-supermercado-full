import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import {
  getMainHeroSlideOrder,
  getMainHeroSlideSettings,
  getStoreLayoutSlot,
  isMainHeroSlideKey,
  STORE_LAYOUT_SLOTS,
  validateMainHeroSlideSettings,
  validateStoreLayoutImage,
} from '@/features/erp/api/store-layout';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const [savedAssets, savedSlideSettings] = await Promise.all([
      prisma.storeLayoutAsset.findMany(),
      prisma.storeLayoutSlideSettings.findMany(),
    ]);
    const assetsByKey = new Map(savedAssets.map((asset) => [asset.key, asset]));
    const settingsByKey = new Map(savedSlideSettings.map((settings) => [settings.key, settings]));
    const addedHeroSlots = savedAssets
      .filter((asset) => isMainHeroSlideKey(asset.key) && asset.key !== 'main-hero')
      .sort((first, second) => getMainHeroSlideOrder(first.key) - getMainHeroSlideOrder(second.key))
      .map((asset) => getStoreLayoutSlot(asset.key));
    return Response.json({
      slots: [...STORE_LAYOUT_SLOTS, ...addedHeroSlots].map((slot) => {
        const asset = assetsByKey.get(slot.key);
        return {
          ...slot,
          imageUrl: asset ? `/api/store-layout/${slot.key}?v=${asset.updatedAt.getTime()}` : '',
          settings: slot.group === 'main'
            ? getMainHeroSlideSettings(settingsByKey.get(slot.key), slot.key)
            : undefined,
          originalName: asset?.originalName || '',
          updatedAt: asset?.updatedAt.toISOString() || null,
          updatedBy: asset?.updatedBy || '',
        };
      }),
    }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } });
  } catch (error) {
    console.error('Não foi possível carregar as imagens do layout da Loja:', error);
    return Response.json({ error: 'Não foi possível carregar as imagens do layout.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'O conteúdo enviado não é um JSON válido.' }, { status: 400 });
  }

  const key = String(body?.key || '');
  if (!isMainHeroSlideKey(key)) return Response.json({ error: 'Selecione um slide válido do banner principal.' }, { status: 400 });
  const settings = validateMainHeroSlideSettings(body?.settings);
  if (!settings) return Response.json({ error: 'Revise as opções, os textos e o destino do botão deste slide.' }, { status: 400 });

  try {
    const savedSettings = await prisma.storeLayoutSlideSettings.upsert({
      where: { key },
      update: { ...settings, updatedBy: erpActorLabel(session.user) },
      create: { key, ...settings, updatedBy: erpActorLabel(session.user) },
    });
    return Response.json({ settings: savedSettings });
  } catch (error) {
    console.error('Não foi possível salvar as opções do slide do banner principal:', error);
    return Response.json({ error: 'Não foi possível salvar as opções deste slide.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'O conteúdo enviado não é um JSON válido.' }, { status: 400 });
  }

  const key = String(body?.key || '');
  if (!getStoreLayoutSlot(key)) return Response.json({ error: 'Selecione uma imagem válida do layout da Loja.' }, { status: 400 });
  const image = validateStoreLayoutImage(body?.imageData);
  if (!image) return Response.json({ error: 'Envie uma imagem PNG, JPEG ou WebP válida de até 2,5 MB após a compressão.' }, { status: 400 });
  const settings = body?.settings === undefined ? null : validateMainHeroSlideSettings(body.settings);
  if (getStoreLayoutSlot(key).group === 'main' && body?.settings !== undefined && !settings) {
    return Response.json({ error: 'Revise as opções, os textos e o destino do botão deste slide.' }, { status: 400 });
  }

  const originalName = String(body?.originalName || '').trim().slice(0, 180) || 'banner';
  try {
    const asset = await prisma.$transaction(async (transaction) => {
      const savedAsset = await transaction.storeLayoutAsset.upsert({
        where: { key },
        update: { ...image, originalName, updatedBy: erpActorLabel(session.user) },
        create: { key, ...image, originalName, updatedBy: erpActorLabel(session.user) },
        select: { updatedAt: true, updatedBy: true, originalName: true },
      });
      if (settings && getStoreLayoutSlot(key).group === 'main') {
        await transaction.storeLayoutSlideSettings.upsert({
          where: { key },
          update: { ...settings, updatedBy: erpActorLabel(session.user) },
          create: { key, ...settings, updatedBy: erpActorLabel(session.user) },
        });
      }
      return savedAsset;
    });
    return Response.json({
      asset: {
        key,
        imageUrl: `/api/store-layout/${key}?v=${asset.updatedAt.getTime()}`,
        originalName: asset.originalName,
        updatedAt: asset.updatedAt.toISOString(),
        updatedBy: asset.updatedBy,
      },
    });
  } catch (error) {
    console.error('Não foi possível salvar a imagem do layout da Loja:', error);
    return Response.json({ error: 'Não foi possível salvar a imagem. Verifique a conexão com o banco de dados.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const key = new URL(request.url).searchParams.get('key') || '';
  if (!getStoreLayoutSlot(key)) return Response.json({ error: 'Selecione uma imagem válida do layout da Loja.' }, { status: 400 });

  try {
    const result = await prisma.$transaction(async (transaction) => {
      const removed = await transaction.storeLayoutAsset.deleteMany({ where: { key } });
      if (isMainHeroSlideKey(key)) {
        await transaction.storeLayoutSlideSettings.deleteMany({ where: { key } });
      }
      return removed;
    });
    return Response.json({ removed: result.count > 0 });
  } catch (error) {
    console.error('Não foi possível remover a imagem do layout da Loja:', error);
    return Response.json({ error: 'Não foi possível remover a imagem. Verifique a conexão com o banco de dados.' }, { status: 500 });
  }
}
