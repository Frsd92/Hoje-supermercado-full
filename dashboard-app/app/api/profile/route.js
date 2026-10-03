import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { prisma } from '@/lib/prisma';
import contentModeration from '@/lib/content-moderation.js';

const maximumPhotoBytes = 1024 * 1024;

async function getCustomer() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  if (!email) return null;
  return { email, name: session.user.name || '', image: session.user.image || '' };
}

function serializeProfile(profile, customer) {
  return {
    fullName: profile?.fullName || customer.name,
    email: customer.email,
    whatsapp: profile?.whatsapp || '',
    cpf: profile?.cpf || '',
    gender: ({ homem: 'masculino', mulher: 'feminino', outro: 'nao_informar' })[profile?.gender] || profile?.gender || 'nao_informar',
    birthDate: profile?.birthDate?.toISOString().slice(0, 10) || '',
    memberSince: profile?.memberSince?.toISOString() || null,
    photo: profile?.photo || null,
    googlePhoto: customer.image,
    monthlyBudget: Number(profile?.monthlyBudget || 0),
  };
}

function validateProfilePhoto(photo) {
  if (photo === null) return null;
  if (typeof photo !== 'string') throw new Error('A foto de perfil é inválida.');

  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo);
  if (!match) throw new Error('Use uma imagem JPG, PNG ou WebP.');

  const image = Buffer.from(match[2], 'base64');
  if (!image.length || image.length > maximumPhotoBytes) {
    throw new Error('A foto precisa ter no máximo 1 MB.');
  }

  const isJpeg = match[1] === 'jpeg' && image[0] === 0xff && image[1] === 0xd8 && image[2] === 0xff;
  const isPng = match[1] === 'png' && image.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isWebp = match[1] === 'webp'
    && image.toString('ascii', 0, 4) === 'RIFF'
    && image.toString('ascii', 8, 12) === 'WEBP';
  if (!isJpeg && !isPng && !isWebp) throw new Error('O arquivo selecionado não é uma imagem válida.');
  return photo;
}

export async function GET() {
  const customer = await getCustomer();
  if (!customer) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  try {
    const profile = await prisma.customerProfile.upsert({
      where: { email: customer.email },
      create: { email: customer.email, fullName: customer.name },
      update: {},
    });
    return Response.json({ profile: serializeProfile(profile, customer) });
  } catch (error) {
    console.error('Não foi possível carregar o perfil do cliente:', error);
    return Response.json({ error: 'Não foi possível carregar seu perfil.' }, { status: 500 });
  }
}

export async function PUT(request) {
  const customer = await getCustomer();
  if (!customer) return Response.json({ error: 'Login necessário.' }, { status: 401 });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400 });
  }

  const updates = {};
  if (Object.hasOwn(body, 'fullName')) {
    if (typeof body.fullName !== 'string' || !body.fullName.trim() || body.fullName.trim().length > 100) {
      return Response.json({ error: 'Informe um nome válido com até 100 caracteres.' }, { status: 400 });
    }
    if (contentModeration.containsOffensiveContent(body.fullName)) {
      return Response.json({ error: 'Remova termos ofensivos do nome antes de salvar.' }, { status: 400 });
    }
    updates.fullName = body.fullName.trim();
  }
  if (Object.hasOwn(body, 'whatsapp')) {
    if (typeof body.whatsapp !== 'string' || body.whatsapp.length > 30) {
      return Response.json({ error: 'Informe um número de WhatsApp válido.' }, { status: 400 });
    }
    updates.whatsapp = body.whatsapp.trim();
  }
  if (Object.hasOwn(body, 'cpf')) {
    const cpf = typeof body.cpf === 'string' ? body.cpf.replace(/\D/g, '') : '';
    if (cpf && cpf.length !== 11) return Response.json({ error: 'Digite um CPF válido com 11 dígitos.' }, { status: 400 });
    updates.cpf = cpf;
  }
  if (Object.hasOwn(body, 'gender')) {
    const gender = ({ homem: 'masculino', mulher: 'feminino', outro: 'nao_informar', '': 'nao_informar' })[body.gender] || body.gender;
    if (!['masculino', 'feminino', 'nao_informar'].includes(gender)) {
      return Response.json({ error: 'Selecione uma opção de gênero válida.' }, { status: 400 });
    }
    updates.gender = gender;
  }
  if (Object.hasOwn(body, 'birthDate')) {
    if (body.birthDate === '') {
      updates.birthDate = null;
    } else if (typeof body.birthDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(body.birthDate)) {
      return Response.json({ error: 'Informe uma data de nascimento válida.' }, { status: 400 });
    } else {
      const [year, month, day] = body.birthDate.split('-').map(Number);
      const birthDate = new Date(Date.UTC(year, month - 1, day));
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      if (
        birthDate.getUTCFullYear() !== year
        || birthDate.getUTCMonth() !== month - 1
        || birthDate.getUTCDate() !== day
        || birthDate > today
      ) return Response.json({ error: 'A data de nascimento não pode ser futura.' }, { status: 400 });
      updates.birthDate = birthDate;
    }
  }
  if (Object.hasOwn(body, 'photo')) {
    try {
      updates.photo = validateProfilePhoto(body.photo);
    } catch (error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
  }
  if (Object.hasOwn(body, 'monthlyBudget')) {
    const budget = Number(body.monthlyBudget);
    if (!Number.isFinite(budget) || budget < 0 || budget > 100000000) {
      return Response.json({ error: 'Informe um orçamento mensal válido.' }, { status: 400 });
    }
    updates.monthlyBudget = Math.round(budget * 100) / 100;
  }
  if (!Object.keys(updates).length) {
    return Response.json({ error: 'Nenhuma informação válida para salvar.' }, { status: 400 });
  }

  try {
    const profile = await prisma.customerProfile.upsert({
      where: { email: customer.email },
      create: { email: customer.email, ...updates },
      update: updates,
    });
    return Response.json({ profile: serializeProfile(profile, customer) });
  } catch (error) {
    console.error('Não foi possível salvar o perfil do cliente:', error);
    return Response.json({ error: 'Não foi possível salvar seu perfil agora.' }, { status: 500 });
  }
}
