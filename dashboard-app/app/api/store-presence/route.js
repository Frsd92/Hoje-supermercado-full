import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pruneStorePresenceData } from '@/features/store-presence/prune';
import { buildStoreTrafficClientCounts, classifyStoreClient } from '@/features/store-presence/client-profile';
import {
  hashStorePresenceCookieId,
  isValidStorePresenceCookieId,
  storePresenceActiveWindowMs,
  storePresenceCookieName,
} from '@/features/store-presence/metrics';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isSameOrigin(request) {
  const origin = request.headers.get('origin');
  const forwardedHost = request.headers.get('x-forwarded-host')?.split(',')[0].trim();
  const host = forwardedHost || request.headers.get('host');
  if (!origin || !host) return false;

  const requestUrl = new URL(request.url);
  const forwardedProtocol = request.headers.get('x-forwarded-proto')?.split(',')[0].trim();
  const protocol = forwardedProtocol || requestUrl.protocol.slice(0, -1);

  try {
    return new URL(origin).origin.toLowerCase() === `${protocol}://${host}`.toLowerCase();
  } catch {
    return false;
  }
}

export async function POST(request) {
  if (!isSameOrigin(request)) {
    return NextResponse.json({ error: 'Origem não autorizada.' }, {
      status: 403,
      headers: { 'Cache-Control': 'no-store' },
    });
  }

  const now = new Date();
  const existingCookieId = request.cookies.get(storePresenceCookieName)?.value;
  const cookieId = isValidStorePresenceCookieId(existingCookieId) ? existingCookieId : randomUUID();
  const sessionId = hashStorePresenceCookieId(cookieId);
  const { deviceType, browser } = classifyStoreClient(request.headers.get('user-agent'));

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.storePresenceSession.upsert({
        where: { id: sessionId },
        create: { id: sessionId, firstSeenAt: now, lastSeenAt: now, deviceType, browser },
        update: { lastSeenAt: now, deviceType, browser },
      });

      const activeSince = new Date(now.getTime() - storePresenceActiveWindowMs);
      const [onlineVisitors, activeSessions] = await Promise.all([
        transaction.storePresenceSession.count({
          where: { lastSeenAt: { gte: activeSince } },
        }),
        transaction.storePresenceSession.groupBy({
          by: ['deviceType', 'browser'],
          where: { lastSeenAt: { gte: activeSince } },
          _count: { _all: true },
        }),
      ]);
      const clientCounts = buildStoreTrafficClientCounts(activeSessions.map((session) => ({
        deviceType: session.deviceType,
        browser: session.browser,
        count: session._count._all,
      })));
      const minute = new Date(Math.floor(now.getTime() / 60_000) * 60_000);

      await transaction.storeTrafficSnapshot.upsert({
        where: { minute },
        create: { minute, onlineVisitors, ...clientCounts, sampledAt: now },
        update: { onlineVisitors, ...clientCounts, sampledAt: now },
      });
    });
    await pruneStorePresenceData(now);

    const response = new NextResponse(null, {
      status: 204,
      headers: { 'Cache-Control': 'no-store' },
    });
    response.cookies.set(storePresenceCookieName, cookieId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 30 * 60,
    });
    return response;
  } catch (error) {
    console.error('Não foi possível registrar a presença anônima na Loja:', error);
    return NextResponse.json({ error: 'Não foi possível registrar a presença agora.' }, {
      status: 503,
      headers: { 'Cache-Control': 'no-store' },
    });
  }
}
