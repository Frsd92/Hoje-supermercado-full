import { randomUUID } from 'node:crypto';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import {
  createPagarmeCustomer,
  createPagarmeCustomerCard,
  deletePagarmeCustomerCard,
  getPagarmeCustomerCards,
  isValidCpf,
  PagarmeApiError,
  splitBrazilianMobilePhone,
} from '@/features/payments/pagarme';
import {
  getSavedCardType,
  MAX_SAVED_CARDS,
  SAVED_CARD_TYPES,
} from '@/features/payments/card-methods';

const cardTokenPattern = /^token_[A-Za-z0-9]+$/;
const customerIdPattern = /^cus_[A-Za-z0-9]+$/;
const cardIdPattern = /^card_[A-Za-z0-9]+$/;
const requestIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function serializeCard(card) {
  const id = String(card?.id || '');
  const lastFourDigits = String(card?.last_four_digits || '');
  const expMonth = Number(card?.exp_month);
  const expYear = Number(card?.exp_year);
  const status = String(card?.status || '').trim().toLowerCase();
  if (
    !cardIdPattern.test(id)
    || !/^\d{4}$/.test(lastFourDigits)
    || !Number.isInteger(expMonth)
    || expMonth < 1
    || expMonth > 12
    || !Number.isInteger(expYear)
    || expYear < 2000
    || !status
  ) {
    throw new Error('A Pagar.me retornou dados inválidos para um cartão salvo.');
  }
  return {
    id,
    brand: String(card.brand || 'Cartão').trim().slice(0, 40),
    lastFourDigits,
    expMonth,
    expYear,
    status,
    type: getSavedCardType(card),
  };
}

function serializeCards(wallet) {
  if (!Array.isArray(wallet?.data)) {
    throw new Error('A Pagar.me retornou uma carteira de cartões inválida.');
  }
  return wallet.data.map(serializeCard);
}

async function getCustomerCardWallet(customerId) {
  const wallet = await getPagarmeCustomerCards(customerId);
  const cards = serializeCards(wallet);
  const reportedTotal = Number(wallet.paging?.total);
  const total = Number.isSafeInteger(reportedTotal) && reportedTotal >= 0
    ? Math.max(reportedTotal, cards.length)
    : cards.length;
  return { cards, total };
}

function getCustomerEmail(session) {
  return session?.user?.email?.trim().toLowerCase() || '';
}

function mapPagarmeError(error) {
  if (!(error instanceof PagarmeApiError)) return null;
  if ([400, 412, 422].includes(error.status)) {
    return { status: 422, message: 'Não foi possível validar o cartão. Confira os dados e tente novamente.' };
  }
  if (error.status === 409) {
    return { status: 409, message: 'O cartão já foi alterado. Atualize a página e tente novamente.' };
  }
  if ([401, 403].includes(error.status)) {
    return { status: 503, message: 'O serviço de cartões está indisponível. Tente novamente mais tarde.' };
  }
  return { status: 502, message: 'Não foi possível concluir a operação com o cartão. Tente novamente.' };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const email = getCustomerEmail(session);
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { email },
      select: { pagarmeCustomerId: true },
    });
    const { cards, total } = profile?.pagarmeCustomerId
      ? await getCustomerCardWallet(profile.pagarmeCustomerId)
      : { cards: [], total: 0 };
    return Response.json({ cards, card: cards[0] || null, total, maxCards: MAX_SAVED_CARDS }, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    const mappedError = mapPagarmeError(error);
    if (mappedError) return Response.json({ error: mappedError.message }, { status: mappedError.status });
    console.error('Não foi possível consultar os cartões salvos do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar os cartões salvos.' }, { status: 500 });
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
  if (Object.keys(body).some((field) => !['cardToken', 'cardType', 'requestId'].includes(field))) {
    return Response.json({ error: 'Envie somente o código seguro do cartão; nunca os dados completos.' }, { status: 400 });
  }
  if (!SAVED_CARD_TYPES.includes(String(body.cardType || ''))) {
    return Response.json({ error: 'Selecione se o cartão é de crédito ou débito.' }, { status: 400 });
  }
  if (!cardTokenPattern.test(String(body.cardToken || ''))) {
    return Response.json({ error: 'O cartão precisa ser validado antes de ser salvo.' }, { status: 400 });
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
    const wallet = await getCustomerCardWallet(profile.pagarmeCustomerId);
    if (wallet.total >= MAX_SAVED_CARDS) {
      return Response.json({
        error: `Sua carteira já atingiu o limite de ${MAX_SAVED_CARDS} cartões.`,
        cards: wallet.cards,
        maxCards: MAX_SAVED_CARDS,
      }, { status: 409 });
    }

    let card;
    try {
      card = await createPagarmeCustomerCard(
      profile.pagarmeCustomerId,
      body.cardToken,
      body.requestId || randomUUID(),
      { cardType: body.cardType },
      );
      card = serializeCard(card);
      if (card.status !== 'active') throw new Error('A Pagar.me não ativou o cartão salvo.');
    } catch (error) {
      const existingCard = wallet.cards.find((savedCard) => savedCard.id === String(card?.id || ''));
      if (!existingCard && cardIdPattern.test(String(card?.id || ''))) {
        try {
          await deletePagarmeCustomerCard(profile.pagarmeCustomerId, card.id);
        } catch (cleanupError) {
          console.error('Não foi possível remover da Pagar.me um cartão inválido:', cleanupError);
        }
      }
      throw error;
    }

    const existingCard = wallet.cards.find((savedCard) => savedCard.id === card.id);
    if (existingCard && existingCard.type !== body.cardType) {
      const savedTypeLabel = existingCard.type === 'debit' ? 'débito' : 'crédito';
      return Response.json({
        error: `Este cartão já está salvo como ${savedTypeLabel}. Remova-o antes de cadastrá-lo com outro tipo.`,
        cards: wallet.cards,
        maxCards: MAX_SAVED_CARDS,
      }, { status: 409 });
    }
    if (card.type !== body.cardType) {
      if (!existingCard) {
        try {
          await deletePagarmeCustomerCard(profile.pagarmeCustomerId, card.id);
        } catch (cleanupError) {
          console.error('Não foi possível remover o cartão cujo tipo não foi confirmado:', cleanupError);
        }
      }
      return Response.json({
        error: 'O processador não confirmou o tipo escolhido para este cartão. Confira se você selecionou crédito ou débito corretamente.',
      }, { status: 422 });
    }
    const cards = existingCard ? wallet.cards : [...wallet.cards, card];

    return Response.json({
      cards,
      card: existingCard || card,
      total: existingCard ? wallet.total : wallet.total + 1,
      maxCards: MAX_SAVED_CARDS,
    }, { status: existingCard ? 200 : 201 });
  } catch (error) {
    const mappedError = mapPagarmeError(error);
    if (mappedError) return Response.json({ error: mappedError.message }, { status: mappedError.status });
    console.error('Não foi possível salvar o cartão do cliente:', error);
    return Response.json({ error: 'Não foi possível salvar o cartão agora. Tente novamente.' }, { status: 500 });
  }
}

export async function DELETE(request) {
  const session = await getServerSession(authOptions);
  const email = getCustomerEmail(session);
  if (!email) return Response.json({ error: 'Login necessário.' }, { status: 401 });
  if (!process.env.PAGARME_SECRET_KEY) {
    return Response.json({ error: 'O serviço de cartões está indisponível no momento.' }, { status: 503 });
  }

  const rawBody = await request.text();
  let body = {};
  if (rawBody.trim()) {
    try {
      body = JSON.parse(rawBody);
    } catch {
      return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
    }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }
  if (Object.keys(body).some((field) => field !== 'cardId')) {
    return Response.json({ error: 'Selecione somente o cartão que deseja remover.' }, { status: 400 });
  }

  try {
    const profile = await prisma.customerProfile.findUnique({
      where: { email },
      select: { pagarmeCustomerId: true, pagarmeCardId: true },
    });
    const cardId = String(body.cardId || profile?.pagarmeCardId || '');
    if (!profile?.pagarmeCustomerId || !cardId) {
      return Response.json({ error: 'Não há cartão salvo para remover.' }, { status: 404 });
    }
    if (!customerIdPattern.test(String(profile.pagarmeCustomerId)) || !cardIdPattern.test(cardId)) {
      throw new Error('Os identificadores do cartão salvo não são válidos.');
    }
    const wallet = await getCustomerCardWallet(profile.pagarmeCustomerId);
    if (!wallet.cards.some((card) => card.id === cardId) && profile.pagarmeCardId !== cardId) {
      return Response.json({ error: 'O cartão selecionado não pertence a esta conta.' }, { status: 404 });
    }

    try {
      await deletePagarmeCustomerCard(profile.pagarmeCustomerId, cardId);
    } catch (error) {
      if (!(error instanceof PagarmeApiError) || error.status !== 404) throw error;
    }
    if (profile.pagarmeCardId === cardId) {
      await prisma.customerProfile.updateMany({
        where: { email, pagarmeCardId: cardId },
        data: {
          pagarmeCardId: null,
          pagarmeCardBrand: null,
          pagarmeCardLastFourDigits: null,
          pagarmeCardExpMonth: null,
          pagarmeCardExpYear: null,
        },
      });
    }
    const { cards, total } = await getCustomerCardWallet(profile.pagarmeCustomerId);
    return Response.json({ cards, card: cards[0] || null, total, maxCards: MAX_SAVED_CARDS });
  } catch (error) {
    const mappedError = mapPagarmeError(error);
    if (mappedError) return Response.json({ error: mappedError.message }, { status: mappedError.status });
    console.error('Não foi possível remover o cartão salvo do cliente:', error);
    return Response.json({ error: 'Não foi possível remover o cartão salvo agora. Tente novamente.' }, { status: 500 });
  }
}
