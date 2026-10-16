import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const defaults = { deliveryFee: 0, serviceFee: 0 };

function parseFee(value, label) {
  const amount = Number(String(value ?? '').trim().replace(',', '.'));
  if (!Number.isFinite(amount) || amount < 0 || amount > 100000) {
    throw new RangeError(`${label} deve estar entre R$ 0,00 e R$ 100.000,00.`);
  }
  return Math.round(amount * 100) / 100;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });
  try {
    const settings = await prisma.checkoutFeeSettings.findUnique({ where: { id: 'default' } });
    return Response.json({
      fees: settings
        ? { deliveryFee: Number(settings.deliveryFee), serviceFee: Number(settings.serviceFee) }
        : defaults,
    }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar as taxas do checkout:', error);
    return Response.json({ error: 'Não foi possível carregar as taxas do checkout.' }, { status: 500, headers });
  }
}

export async function PATCH(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Informe valores válidos para as taxas.' }, { status: 400, headers });
  }

  let fees;
  try {
    fees = {
      deliveryFee: parseFee(body?.deliveryFee, 'A taxa de entrega'),
      serviceFee: parseFee(body?.serviceFee, 'A taxa de serviço'),
    };
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400, headers });
  }

  try {
    const settings = await prisma.checkoutFeeSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...fees, updatedBy: erpActorLabel(session.user) },
      update: { ...fees, updatedBy: erpActorLabel(session.user) },
    });
    return Response.json({
      fees: { deliveryFee: Number(settings.deliveryFee), serviceFee: Number(settings.serviceFee) },
    }, { headers });
  } catch (error) {
    console.error('Não foi possível salvar as taxas do checkout:', error);
    return Response.json({ error: 'Não foi possível salvar as taxas do checkout.' }, { status: 500, headers });
  }
}
