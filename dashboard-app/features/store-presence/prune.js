import { prisma } from '@/lib/prisma';
import {
  storePresenceSessionRetentionMs,
  storePresenceSnapshotRetentionMs,
} from './metrics.js';

const cleanupIntervalMs = 6 * 60 * 60 * 1000;
let nextCleanupAt = 0;

export async function pruneStorePresenceData(now = new Date()) {
  if (now.getTime() < nextCleanupAt) return;
  nextCleanupAt = now.getTime() + cleanupIntervalMs;

  try {
    await Promise.all([
      prisma.storePresenceSession.deleteMany({
        where: { lastSeenAt: { lt: new Date(now.getTime() - storePresenceSessionRetentionMs) } },
      }),
      prisma.storeTrafficSnapshot.deleteMany({
        where: { minute: { lt: new Date(now.getTime() - storePresenceSnapshotRetentionMs) } },
      }),
    ]);
  } catch (error) {
    nextCleanupAt = now.getTime() + 60 * 60 * 1000;
    console.error('Não foi possível remover os dados antigos de presença da Loja:', error);
  }
}
