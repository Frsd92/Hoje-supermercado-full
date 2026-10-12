import { getServerSession } from 'next-auth';
import { authOptions } from '@/auth';
import { hasErpAccess } from '@/features/erp/access';
import { normalizeSupplierTaxId, validateSupplier } from '@/features/erp/api/supplier-data';

const headers = { 'Cache-Control': 'private, no-store, max-age=0' };
const lookupTimeoutMs = 8_000;

function clean(value, maxLength = 160) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

function validSupplierDocument(value) {
  return !validateSupplier({ name: 'Consulta de cadastro', taxId: value }).error;
}

async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(lookupTimeoutMs),
  });
  if (!response.ok) return null;
  return response.json();
}

export async function GET(request) {
  const session = await getServerSession(authOptions);
  if (!hasErpAccess(session?.user)) return Response.json({ error: 'Acesso negado.' }, { status: 403, headers });

  const params = new URL(request.url).searchParams;
  const type = params.get('type');
  const value = normalizeSupplierTaxId(params.get('value'));
  if (type === 'cep') {
    if (!/^\d{8}$/.test(value)) return Response.json({ error: 'Informe um CEP com oito dígitos.' }, { status: 400, headers });
    try {
      const result = await fetchJson(`https://viacep.com.br/ws/${value}/json/`);
      if (!result || result.erro) return Response.json({ error: 'CEP não encontrado. Confira o número ou preencha o endereço manualmente.' }, { status: 404, headers });
      return Response.json({
        address: clean(result.logradouro),
        neighborhood: clean(result.bairro),
        city: clean(result.localidade),
        state: clean(result.uf, 2).toUpperCase(),
        postalCode: clean(result.cep, 9),
      }, { headers });
    } catch (error) {
      console.error('Não foi possível consultar o CEP do fornecedor:', error);
      return Response.json({ error: 'Serviço de consulta de CEP indisponível. Preencha o endereço manualmente.' }, { status: 502, headers });
    }
  }

  if (type === 'cnpj') {
    if (!/^\d{14}$/.test(value) || !validSupplierDocument(value)) {
      return Response.json({ error: 'Informe um CNPJ válido com 14 dígitos.' }, { status: 400, headers });
    }
    try {
      const result = await fetchJson(`https://brasilapi.com.br/api/cnpj/v1/${value}`);
      if (!result || result.message) {
        return Response.json({ error: 'CNPJ não encontrado. Confira o número ou preencha o cadastro manualmente.' }, { status: 404, headers });
      }
      return Response.json({
        name: clean(result.nome_fantasia || result.razao_social),
        legalName: clean(result.razao_social),
        email: clean(result.email, 254).toLowerCase(),
        phone: clean(result.ddd_telefone_1, 30),
        address: [clean(result.logradouro), clean(result.numero, 20), clean(result.complemento, 80)].filter(Boolean).join(', '),
        neighborhood: clean(result.bairro),
        city: clean(result.municipio),
        state: clean(result.uf, 2).toUpperCase(),
        postalCode: normalizeSupplierTaxId(result.cep).slice(0, 8),
      }, { headers });
    } catch (error) {
      console.error('Não foi possível consultar o CNPJ do fornecedor:', error);
      return Response.json({ error: 'Serviço de consulta de CNPJ indisponível. Preencha o cadastro manualmente.' }, { status: 502, headers });
    }
  }

  return Response.json({ error: 'Selecione uma consulta de CEP ou CNPJ válida.' }, { status: 400, headers });
}
