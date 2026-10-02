import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { normalizeRegionText } from '@/features/service-regions/region-utils';
import { prisma } from '@/lib/prisma';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };

async function hasAccess() {
  const session = await getServerSession(authOptions);
  return hasErpAccess(session?.user);
}

export async function GET() {
  if (!(await hasAccess())) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  try {
    const states = await prisma.serviceRegionState.findMany({
      include: {
        municipalities: { orderBy: { name: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });
    return Response.json({ states }, { headers });
  } catch (error) {
    console.error('Não foi possível carregar a configuração de regiões atendidas:', error);
    return Response.json({ error: 'Não foi possível carregar as regiões atendidas.' }, { status: 500, headers });
  }
}

export async function POST(request) {
  if (!(await hasAccess())) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }

  const stateUf = String(body?.stateUf || '').trim().toUpperCase();
  const name = String(body?.name || '').trim().replace(/\s+/g, ' ');
  if (!/^[A-Z]{2}$/.test(stateUf) || !name || name.length > 120) {
    return Response.json({ error: 'Informe um estado e um nome de município válidos.' }, { status: 400, headers });
  }

  try {
    const state = await prisma.serviceRegionState.findUnique({
      where: { uf: stateUf },
      select: { uf: true, enabled: true },
    });
    if (!state) return Response.json({ error: 'Estado não encontrado.' }, { status: 404, headers });
    if (!state.enabled) {
      return Response.json({ error: 'Libere o estado antes de adicionar municípios.' }, { status: 409, headers });
    }

    const existing = await prisma.serviceRegionMunicipality.findMany({
      where: { stateUf },
      select: { name: true },
    });
    if (existing.some((municipality) => normalizeRegionText(municipality.name) === normalizeRegionText(name))) {
      return Response.json({ error: 'Este município já está cadastrado para o estado selecionado.' }, { status: 409, headers });
    }

    const municipality = await prisma.serviceRegionMunicipality.create({
      data: { name, stateUf, enabled: true },
    });
    return Response.json({ municipality }, { status: 201, headers });
  } catch (error) {
    if (error?.code === 'P2002') {
      return Response.json({ error: 'Este município já está cadastrado para o estado selecionado.' }, { status: 409, headers });
    }
    console.error('Não foi possível cadastrar o município atendido:', error);
    return Response.json({ error: 'Não foi possível cadastrar o município.' }, { status: 500, headers });
  }
}

export async function PATCH(request) {
  if (!(await hasAccess())) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'Os dados enviados são inválidos.' }, { status: 400, headers });
  }

  if (typeof body?.enabled !== 'boolean') {
    return Response.json({ error: 'Informe se a região deve ficar ativa ou inativa.' }, { status: 400, headers });
  }

  try {
    if (typeof body.stateUf === 'string' && /^[A-Za-z]{2}$/.test(body.stateUf.trim())) {
      const stateUf = body.stateUf.trim().toUpperCase();
      const result = await prisma.serviceRegionState.updateMany({
        where: { uf: stateUf },
        data: { enabled: body.enabled },
      });
      if (!result.count) return Response.json({ error: 'Estado não encontrado.' }, { status: 404, headers });
      return Response.json({ success: true }, { headers });
    }

    const municipalityId = String(body?.municipalityId || '').trim();
    if (!municipalityId) return Response.json({ error: 'Informe um estado ou município para atualizar.' }, { status: 400, headers });

    const municipality = await prisma.serviceRegionMunicipality.findUnique({
      where: { id: municipalityId },
      select: { id: true, state: { select: { enabled: true } } },
    });
    if (!municipality) return Response.json({ error: 'Município não encontrado.' }, { status: 404, headers });
    if (body.enabled && !municipality.state.enabled) {
      return Response.json({ error: 'Libere o estado antes de ativar o município.' }, { status: 409, headers });
    }

    await prisma.serviceRegionMunicipality.update({
      where: { id: municipalityId },
      data: { enabled: body.enabled },
    });
    return Response.json({ success: true }, { headers });
  } catch (error) {
    console.error('Não foi possível atualizar a região atendida:', error);
    return Response.json({ error: 'Não foi possível atualizar a região.' }, { status: 500, headers });
  }
}
