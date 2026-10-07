import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  createPagarmeCustomer,
  createPagarmeCustomerCard,
  deletePagarmeCustomerCard,
  isValidCpf,
  PagarmeApiError,
  splitBrazilianMobilePhone,
} from '@/features/payments/pagarme';

const cardTokenPattern = /^token_[A-Za-z0-9]+$/;
const customerIdPattern = /^cus_[A-Za-z0-9]+$/;
const cardIdPattern = /^card_[A-Za-z0-9]+$/;
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serializeCard(profile) {
  if (!profile?.pagarmeCardId) return null;
  return {
    brand: profile.pagarmeCardBrand || 'Cartão',
    lastFourDigits: profile.pagarmeCardLastFourDigits,
    expMonth: profile.pagarmeCardExpMonth,
    expYear: profile.pagarmeCardExpYear,
  };
}

function getCustomerEmail(session) {
  return session?.user?.email?.trim().toLowerCase() || '';
}

function mapPagarmeError(error) {
  if (!(error instanceof PagarmeApiError)) return null;
  if ([400, 412, 422].includes(error.status)) {
    return { status: 422, message: 'A Pagar.me não aceitou o cartão. Confira os dados e tente novamente.' };
  }
  if (error.status === 409) {
    return { status: 409, message: 'O cartão já foi alterado. Atualize a página e tente novamente.' };
  }
  if ([401, 403].includes(error.status)) {
    return { status: 503, message: 'O serviço de cartões está indisponível. Tente novamente mais tarde.' };
  }
  return { status: 502, message: 'Não foi possível concluir a operação com a Pagar.me.' };
}

function readProfileCardFields(profile) {
  return {
    pagarmeCustomerId: profile?.pagarmeCustomerId || null,
    pagarmeCardId: profile?.pagarmeCardId || null,
    pagarmeCardBrand: profile?.pagarmeCardBrand || null,
    pagarmeCardLastFourDigits: profile?.pagarmeCardLastFourDigits || null,
    pagarmeCardExpMonth: profile?.pagarmeCardExpMonth ?? null,
    pagarmeCardExpYear: profile?.pagarmeCardExpYear ?? null,
  };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = getCustomerEmail(session);
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { email },
      select: {
        pagarmeCardId: true,
        pagarmeCardBrand: true,
        pagarmeCardLastFourDigits: true,
        pagarmeCardExpMonth: true,
        pagarmeCardExpYear: true,
      },
    });
    return Response.json({ card: serializeCard(profile) }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('Não foi possível consultar o cartão salvo do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar o cartão salvo.' }, { status: 500 });
  }
}

export async function POST(request) {
  const session = await getServerSession(authOptions);
  const email = getCustomerEmail(session);
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  if (!process.env.PAGARME_SECRET_KEY || !process.env.PAGARME_PUBLIC_KEY) {
    return Response.json({ error: 'O cadastro de cartão está indisponível no momento.' }, { status: 503 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }
  if (Object.keys(body).some((field) => !['cardToken', 'requestId'].includes(field))) {
    return Response.json({ error: 'Envie somente o token seguro gerado pela Pagar.me, nunca os dados abertos do cartão.' }, { status: 400 });
  }
  if (!cardTokenPattern.test(String(body.cardToken || ''))) {
    return Response.json({ error: 'O cartão precisa ser tokenizado pela Pagar.me antes de ser salvo.' }, { status: 400 });
  }
  if (body.requestId !== undefined && !requestIdPattern.test(String(body.requestId))) {
    return Response.json({ error: 'Não foi possível identificar esta tentativa. Atualize a página e tente novamente.' }, { status: 400 });
  }

  try {
    let profile = await prisma.customerProfile.upsert({
      where: { email },
      create: { email, fullName: session.user.name || null },
      update: {},
    });
    if (profile.pagarmeCardId) {
      return Response.json({ error: 'Já existe um cartão salvo. Remova-o antes de cadastrar outro.' }, { status: 409 });
    }

    const name = String(profile.fullName || session.user.name || '').trim();
    const document = String(profile.cpf || '').replace(/\D/g, '');
    const mobilePhone = splitBrazilianMobilePhone(profile.whatsapp);
    if (!name || name.length > 64 || email.length > 64 || !isValidCpf(document) || !mobilePhone) {
      return Response.json({
        error: 'Complete seu nome, CPF e celular com DDD no perfil antes de cadastrar o cartão.',
      }, { status: 422 });
    }

    if (!profile.pagarmeCustomerId) {
      const customer = await createPagarmeCustomer({
        name,
        email,
        type: 'individual',
        document,
        document_type: 'CPF',
        phones: { mobile_phone: mobilePhone },
      });
      if (!customerIdPattern.test(String(customer?.id || ''))) {
        throw new Error('A Pagar.me não retornou um identificador de cliente válido.');
      }
      profile = await prisma.customerProfile.update({
        where: { email },
        data: { pagarmeCustomerId: customer.id },
      });
    }

    if (!customerIdPattern.test(String(profile.pagarmeCustomerId || ''))) {
      throw new Error('O identificador do cliente da Pagar.me não é válido.');
    }
    const card = await createPagarmeCustomerCard(
      profile.pagarmeCustomerId,
      body.cardToken,
      body.requestId || randomUUID(),
    );
    const lastFourDigits = String(card?.last_four_digits || '');
    const expMonth = Number(card?.exp_month);
    const expYear = Number(card?.exp_year);
    if (
      !cardIdPattern.test(String(card?.id || ''))
      || !/^\d{4}$/.test(lastFourDigits)
      || !Number.isInteger(expMonth)
      || expMonth < 1
      || expMonth > 12
      || !Number.isInteger(expYear)
      || expYear < new Date().getFullYear()
      || (card.status && card.status !== 'active')
    ) {
      throw new Error('A Pagar.me retornou dados inválidos para o cartão salvo.');
    }

    let saved;
    try {
      saved = await prisma.customerProfile.updateMany({
        where: {
          email,
          pagarmeCustomerId: profile.pagarmeCustomerId,
          pagarmeCardId: null,
        },
        data: {
          pagarmeCardId: card.id,
          pagarmeCardBrand: String(card.brand || 'Cartão').trim().slice(0, 40),
          pagarmeCardLastFourDigits: lastFourDigits,
          pagarmeCardExpMonth: expMonth,
          pagarmeCardExpYear: expYear,
        },
      });
    } catch (error) {
      try {
        await deletePagarmeCustomerCard(profile.pagarmeCustomerId, card.id);
      } catch (cleanupError) {
        console.error('Não foi possível remover da Pagar.me um cartão que não foi persistido:', cleanupError);
      }
      throw error;
    }

    if (saved.count !== 1) {
      const currentProfile = await prisma.customerProfile.findUnique({
        where: { email },
        select: {
          pagarmeCardId: true,
          pagarmeCardBrand: true,
          pagarmeCardLastFourDigits: true,
          pagarmeCardExpMonth: true,
          pagarmeCardExpYear: true,
        },
      });
      if (currentProfile?.pagarmeCardId === card.id) {
        return Response.json({ card: serializeCard(currentProfile) }, { status: 200 });
      }
      try {
        await deletePagarmeCustomerCard(profile.pagarmeCustomerId, card.id);
      } catch (error) {
        console.error('Não foi possível remover da Pagar.me um cartão concorrente não salvo:', error);
        return Response.json({
          error: 'O cartão não foi salvo na conta. Não foi possível concluir a limpeza segura; contate o suporte.',
        }, { status: 502 });
      }
      return Response.json({ error: 'Já existe um cartão salvo. Atualize a página para conferir.' }, { status: 409 });
    }

    return Response.json({
      card: {
        brand: String(card.brand || 'Cartão').trim().slice(0, 40),
        lastFourDigits,
        expMonth,
        expYear,
      },
    }, { status: 201 });
  } catch (error) {
    const mappedError = mapPagarmeError(error);
    if (mappedError) return Response.json({ error: mappedError.message }, { status: mappedError.status });
    console.error('Não foi possível salvar o cartão do cliente:', error);
    return Response.json({ error: 'Não foi possível salvar o cartão agora. Tente novamente.' }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getServerSession(authOptions);
  const email = getCustomerEmail(session);
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  if (!process.env.PAGARME_SECRET_KEY) {
    return Response.json({ error: 'O serviço de cartões está indisponível no momento.' }, { status: 503 });
  }

  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { email },
      select: { pagarmeCustomerId: true, pagarmeCardId: true },
    });
    if (!profile?.pagarmeCardId) return Response.json({ error: 'Não há cartão salvo para remover.' }, { status: 404 });
    if (!customerIdPattern.test(String(profile.pagarmeCustomerId || '')) || !cardIdPattern.test(profile.pagarmeCardId)) {
      throw new Error('Os identificadores do cartão salvo não são válidos.');
    }

    try {
      await deletePagarmeCustomerCard(profile.pagarmeCustomerId, profile.pagarmeCardId);
    } catch (error) {
      if (!(error instanceof PagarmeApiError) || error.status !== 404) throw error;
    }
    await prisma.customerProfile.updateMany({
      where: { email, pagarmeCardId: profile.pagarmeCardId },
      data: {
        pagarmeCardId: null,
        pagarmeCardBrand: null,
        pagarmeCardLastFourDigits: null,
        pagarmeCardExpMonth: null,
        pagarmeCardExpYear: null,
      },
    });
    return Response.json({ card: null });
  } catch (error) {
    const mappedError = mapPagarmeError(error);
    if (mappedError) return Response.json({ error: mappedError.message }, { status: mappedError.status });
    console.error('Não foi possível remover o cartão salvo do cliente:', error);
    return Response.json({ error: 'Não foi possível remover o cartão salvo agora. Tente novamente.' }, { status: 500 });
  }
}
