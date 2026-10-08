import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { pruneStorePresenceData } from '@/features/store-presence/prune';
import {
  buildStoreTrafficHistory,
  getStoreTrafficPeriodStart,
  isStoreTrafficPeriod,
  storePresenceActiveWindowMs,
  storePresenceSnapshotRetentionMs,
} from '@/features/store-presence/metrics';

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) {
    return NextResponse.json({ error: 'Acesso negado.' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const now = new Date();
  const url = new URL(request.url);
  const period = url.searchParams.get('period') || '24h';
  const currentOnly = url.searchParams.get('currentOnly') === '1';
  if (!isStoreTrafficPeriod(period)) {
    return NextResponse.json({ error: 'Período de histórico inválido.' }, {
      status: 400,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  try {
    await pruneStorePresenceData(now);
    const onlineVisitors = await prisma.storePresenceSession.count({
      where: { lastSeenAt: { gte: new Date(now.getTime() - storePresenceActiveWindowMs) } },
    });

    if (currentOnly) {
      return NextResponse.json({ onlineVisitors, updatedAt: now.toISOString() }, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    const retentionStart = new Date(now.getTime() - storePresenceSnapshotRetentionMs);
    const historyStart = new Date(Math.max(
      getStoreTrafficPeriodStart(period, now).getTime(),
      retentionStart.getTime(),
    ));
    const [firstSample, snapshots] = await Promise.all([
      prisma.storeTrafficSnapshot.findFirst({
        where: { minute: { gte: retentionStart } },
        orderBy: { minute: 'asc' },
        select: { minute: true },
      }),
      prisma.storeTrafficSnapshot.findMany({
        where: { minute: { gte: historyStart, lt: now } },
        orderBy: { minute: 'asc' },
        select: { minute: true, onlineVisitors: true },
      }),
    ]);

    return NextResponse.json({
      onlineVisitors,
      updatedAt: now.toISOString(),
      period,
      trackingStartedAt: firstSample?.minute.toISOString() || null,
      history: buildStoreTrafficHistory({
        snapshots,
        period,
        now,
        trackingStartedAt: firstSample?.minute || null,
      }),
      retentionDays: Math.floor(storePresenceSnapshotRetentionMs / (24 * 60 * 60 * 1000)),
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Não foi possível carregar os indicadores de presença da Loja:', error);
    return NextResponse.json({ error: 'Não foi possível carregar a presença da Loja agora.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
