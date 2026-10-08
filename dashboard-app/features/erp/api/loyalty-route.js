import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { getLoyaltyAdminSnapshot } from '@/features/loyalty/service';
import {
  validateLoyaltyMissionPayload,
  validateLoyaltyRewardPayload,
} from '@/features/loyalty/mission-validation';
import { prisma } from '@/lib/prisma';

const missionFieldsLockedAfterProgress = [
  'ruleType',
  'targetAmount',
  'targetCount',
  'category',
  'pointsReward',
  'recurrence',
  'startsAt',
  'endsAt',
  'pointsExpiryPolicy',
  'pointsExpiryDays',
  'pointsExpireAt',
];

function missionFieldChanged(existing, next, field) {
  if (field === 'targetAmount') return Number(existing[field]) !== next[field];
  if (['startsAt', 'endsAt', 'pointsExpireAt'].includes(field)) {
    return (existing[field]?.getTime() || null) !== (next[field]?.getTime() || null);
  }
  return existing[field] !== next[field];
}

function validationError(error) {
  return error instanceof TypeError || error instanceof RangeError;
}

async function readBody(request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
    return body;
  } catch {
    return null;
  }
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const [snapshot, products] = await Promise.all([
      getLoyaltyAdminSnapshot(prisma),
      prisma.product.findMany({ select: { categories: true } }),
    ]);
    const categories = [...new Set(products.flatMap((product) => (
      Array.isArray(product.categories) ? product.categories : []
    )).map((category) => String(category).trim()).filter(Boolean))]
      .sort((first, second) => first.localeCompare(second, 'pt-BR'));
    return Response.json({ ...snapshot, categories });
  } catch (error) {
    console.error('Não foi possível carregar o programa de fidelidade no ERP:', error);
    return Response.json({ error: 'Não foi possível carregar o programa de fidelidade.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  const body = await readBody(request);
  if (!body || !['mission', 'reward'].includes(body.type)) {
    return Response.json({ error: 'Informe uma missão ou recompensa válida.' }, { status: 400 });
  }

  try {
    if (body.type === 'mission') {
      const mission = validateLoyaltyMissionPayload(body);
      const created = await prisma.loyaltyMission.create({
        data: { ...mission, createdBy: erpActorLabel(session.user) },
      });
      return Response.json({ mission: created }, { status: 201 });
    }

    const reward = validateLoyaltyRewardPayload(body);
    const created = await prisma.loyaltyReward.create({
      data: { ...reward, createdBy: erpActorLabel(session.user) },
    });
    return Response.json({ reward: created }, { status: 201 });
  } catch (error) {
    if (validationError(error)) return Response.json({ error: error.message }, { status: 400 });
    console.error('Não foi possível criar o item do programa de fidelidade:', error);
    return Response.json({ error: 'Não foi possível criar o item do programa de fidelidade.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });
  const body = await readBody(request);
  if (!body || !['mission', 'reward'].includes(body.type) || !String(body.id || '').trim()) {
    return Response.json({ error: 'Informe o item do programa de fidelidade que deseja atualizar.' }, { status: 400 });
  }

  try {
    if (body.type === 'mission') {
      const mission = validateLoyaltyMissionPayload(body);
      const result = await prisma.$transaction(async (transaction) => {
        const existing = await transaction.loyaltyMission.findUnique({
          where: { id: String(body.id).trim() },
          include: { _count: { select: { progress: true } } },
        });
        if (!existing) return { error: 'A missão não foi encontrada.', status: 404 };
        if (mission.rewardLimit !== null && mission.rewardLimit < existing.claimedRewards) {
          return { error: 'O limite não pode ser menor do que as recompensas já concedidas.', status: 409 };
        }
        if (existing._count.progress > 0
          && missionFieldsLockedAfterProgress.some((field) => missionFieldChanged(existing, mission, field))) {
          return {
            error: 'As regras e o prazo não podem ser alterados depois que clientes iniciaram esta missão. Pause a missão para interromper novas participações.',
            status: 409,
          };
        }
        const updated = await transaction.loyaltyMission.update({
          where: { id: existing.id },
          data: mission,
        });
        return { mission: updated };
      }, { isolationLevel: 'Serializable' });
      if (result.error) return Response.json({ error: result.error }, { status: result.status });
      return Response.json({ mission: result.mission });
    }

    const reward = validateLoyaltyRewardPayload(body);
    const existing = await prisma.loyaltyReward.findUnique({ where: { id: String(body.id).trim() } });
    if (!existing) return Response.json({ error: 'A recompensa não foi encontrada.' }, { status: 404 });
    const updated = await prisma.loyaltyReward.update({ where: { id: existing.id }, data: reward });
    return Response.json({ reward: updated });
  } catch (error) {
    if (validationError(error)) return Response.json({ error: error.message }, { status: 400 });
    if (error?.code === 'P2034') return Response.json({ error: 'O item foi alterado em outra operação. Atualize a tela e tente novamente.' }, { status: 409 });
    console.error('Não foi possível atualizar o item do programa de fidelidade:', error);
    return Response.json({ error: 'Não foi possível atualizar o item do programa de fidelidade.' }, { status: 500 });
  }
}
