import { randomUUID } from 'crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { erpActorLabel, hasErpAccess } from '@/features/erp/access';
import { prisma } from '@/lib/prisma';
import { summarizeCouponCampaign } from '@/features/coupons/coupon-reporting';

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  try {
    const campaigns = await prisma.couponCampaign.findMany({
      select: {
        id: true,
        code: true,
        discountPercent: true,
        expiresAt: true,
        createdAt: true,
        createdBy: true,
        message: true,
        recipients: { select: { email: true } },
        redemptions: { select: { email: true, orderId: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    const codes = campaigns.map((campaign) => campaign.code);
    const orders = codes.length
      ? await prisma.order.findMany({
        where: { couponCode: { in: codes } },
        select: {
          id: true,
          couponCode: true,
          customerEmail: true,
          total: true,
          couponDiscountAmount: true,
          status: true,
          paymentStatus: true,
          refundedAmount: true,
          createdAt: true,
        },
      })
      : [];
    const now = new Date();
    return Response.json({
      campaigns: campaigns.map((campaign) => ({
        ...summarizeCouponCampaign(campaign, orders, now),
        createdBy: campaign.createdBy,
      })),
    });
  } catch (error) {
    console.error('Não foi possível carregar os cupons enviados:', error);
    return Response.json({ error: 'Não foi possível carregar os cupons enviados.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403 });

  const body = await request.json();
  const code = String(body?.code || '').trim().toUpperCase();
  const discountPercent = Number(body?.discountPercent);
  const durationDays = Number(body?.durationDays);
  const message = String(body?.message || '').trim();
  const recipients = Array.isArray(body?.recipients)
    ? [...new Set(body.recipients.map((email) => String(email).trim().toLowerCase()).filter((email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))]
    : [];

  if (!/^[A-Z0-9_-]{3,24}$/.test(code)
    || !Number.isInteger(discountPercent) || discountPercent < 1 || discountPercent > 90
    || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 365
    || !recipients.length || message.length > 300) {
    return Response.json({ error: 'Informe um código válido, desconto entre 1% e 90%, validade entre 1 e 365 dias e ao menos um cliente.' }, { status: 400 });
  }

  try {
    const existingCampaign = await prisma.couponCampaign.findUnique({
      where: { code },
      include: { recipients: { select: { email: true } } },
    });

    if (existingCampaign) {
      if (existingCampaign.expiresAt.getTime() <= Date.now()) {
        return Response.json({ error: 'Este cupom já expirou. Crie um novo código para enviar descontos.' }, { status: 409 });
      }
      if (existingCampaign.discountPercent !== discountPercent) {
        return Response.json({ error: `O cupom ${code} já existe com ${existingCampaign.discountPercent}% de desconto. Para manter o mesmo cupom, use esse percentual.` }, { status: 409 });
      }

      const addedRecipients = await prisma.couponRecipient.createMany({
        data: recipients.map((email) => ({ campaignId: existingCampaign.id, email })),
        skipDuplicates: true,
      });
      if (!addedRecipients.count) {
        return Response.json({ error: 'Todos os clientes selecionados já receberam este cupom.' }, { status: 409 });
      }
      return Response.json({
        campaign: {
          id: existingCampaign.id,
          code: existingCampaign.code,
          discountPercent: existingCampaign.discountPercent,
          expiresAt: existingCampaign.expiresAt,
          createdAt: existingCampaign.createdAt,
          recipientsCount: existingCampaign.recipients.length + addedRecipients.count,
          addedRecipientsCount: addedRecipients.count,
          recipientEmails: [...existingCampaign.recipients.map((recipient) => recipient.email), ...recipients.filter((email) => !existingCampaign.recipients.some((recipient) => recipient.email === email))],
          message: existingCampaign.message,
        },
      }, { status: 200 });
    }

    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + durationDays * 86400000).toISOString();
    const campaignId = `CPN-${randomUUID()}`;
    const couponMessage = [`Você recebeu ${discountPercent}% de desconto!`, `Use o cupom ${code} na finalização da compra.`, message, `Válido até ${new Date(expiresAt).toLocaleDateString('pt-BR')}.`].filter(Boolean).join(' ');
    await prisma.couponCampaign.create({
      data: {
        id: campaignId,
        code,
        discountPercent,
        message: couponMessage,
        expiresAt: new Date(expiresAt),
        createdBy: erpActorLabel(session.user),
        recipients: { create: recipients.map((email) => ({ email })) },
      },
    });
    return Response.json({ campaign: { id: campaignId, code, discountPercent, expiresAt, createdAt: createdAt.toISOString(), recipientsCount: recipients.length, addedRecipientsCount: recipients.length, recipientEmails: recipients, message: couponMessage } }, { status: 201 });
  } catch (error) {
    if (error.code === 'P2002') return Response.json({ error: 'Este cupom já foi atualizado por outra operação. Atualize a tela e tente novamente.' }, { status: 409 });
    console.error('Não foi possível enviar o cupom:', error);
    return Response.json({ error: 'Não foi possível enviar o cupom. Tente novamente.' }, { status: 500 });
  }
}
