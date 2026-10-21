import 'server-only';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';
import { buildBlingSalesOrderPayload } from './bling-payload.js';

const tokenEndpoint = 'https://api.bling.com.br/Api/v3/oauth/token';
const apiBaseUrl = 'https://api.bling.com.br/Api/v3';
const connectionId = 'default';

export class BlingIntegrationError extends Error {
  constructor(message, status = 502, { uncertain = false } = {}) {
    super(message);
    this.name = 'BlingIntegrationError';
    this.status = status;
    this.uncertain = uncertain;
  }
}

export function getBlingConfiguration() {
  const redirectUri = process.env.BLING_REDIRECT_URI?.trim() || '';
  const clientId = process.env.BLING_CLIENT_ID?.trim() || '';
  const clientSecret = process.env.BLING_CLIENT_SECRET?.trim() || '';
  const keyHex = process.env.BLING_TOKEN_ENCRYPTION_KEY?.trim() || '';
  const key = /^[a-f0-9]{64}$/i.test(keyHex) ? Buffer.from(keyHex, 'hex') : null;
  let hasRedirectUri = false;
  try {
    const url = new URL(redirectUri);
    hasRedirectUri = (url.protocol === 'https:' || (url.protocol === 'http:' && url.hostname === 'localhost'))
      && url.pathname === '/api/erp/bling/callback'
      && !url.search
      && !url.hash;
  } catch {
    hasRedirectUri = false;
  }

  return {
    clientId,
    clientSecret,
    redirectUri,
    key,
    ready: Boolean(clientId && clientSecret && hasRedirectUri && key),
    hasClientCredentials: Boolean(clientId && clientSecret),
    hasRedirectUri,
    hasEncryptionKey: Boolean(key),
  };
}

function encryptToken(token) {
  const { key } = getBlingConfiguration();
  if (!key) throw new BlingIntegrationError('A chave de criptografia do Bling não está configurada.', 503);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(token, 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), encrypted.toString('base64url')].join('.');
}

function decryptToken(encryptedValue) {
  const { key } = getBlingConfiguration();
  if (!key) throw new BlingIntegrationError('A chave de criptografia do Bling não está configurada.', 503);
  const [version, ivValue, tagValue, dataValue] = String(encryptedValue || '').split('.');
  if (version !== 'v1' || !ivValue || !tagValue || !dataValue) {
    throw new BlingIntegrationError('As credenciais do Bling armazenadas não podem ser lidas; reconecte a integração.', 503);
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivValue, 'base64url'));
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    return Buffer.concat([
      decipher.update(Buffer.from(dataValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
  } catch {
    throw new BlingIntegrationError('A chave de criptografia mudou; reconecte a integração com o Bling.', 503);
  }
}

async function exchangeToken(parameters) {
  const config = getBlingConfiguration();
  if (!config.ready) throw new BlingIntegrationError('Configure as variáveis de ambiente da integração Bling antes de conectar.', 503);
  let response;
  try {
    response = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`,
        Accept: '1.0',
        'Content-Type': 'application/x-www-form-urlencoded',
        'enable-jwt': '1',
      },
      body: new URLSearchParams(parameters),
      cache: 'no-store',
    });
  } catch {
    throw new BlingIntegrationError('Não foi possível conectar ao serviço de autenticação do Bling.', 502);
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new BlingIntegrationError('O Bling retornou uma resposta de autenticação inválida.', 502);
  }
  if (!response.ok) {
    console.error('A autenticação OAuth do Bling falhou com status HTTP:', response.status);
    throw new BlingIntegrationError('O Bling recusou a autorização. Confira o aplicativo e a URL de retorno cadastrada.', 502);
  }
  if (typeof payload.access_token !== 'string'
    || !payload.access_token
    || typeof payload.refresh_token !== 'string'
    || !payload.refresh_token
    || !Number.isFinite(Number(payload.expires_in))
    || Number(payload.expires_in) <= 0) {
    throw new BlingIntegrationError('O Bling não retornou os tokens de acesso esperados.', 502);
  }
  return payload;
}

async function saveTokens(tokens) {
  return prisma.blingConnection.upsert({
    where: { id: connectionId },
    create: {
      id: connectionId,
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: encryptToken(tokens.refresh_token),
      accessTokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in) * 1000),
    },
    update: {
      encryptedAccessToken: encryptToken(tokens.access_token),
      encryptedRefreshToken: encryptToken(tokens.refresh_token),
      accessTokenExpiresAt: new Date(Date.now() + Number(tokens.expires_in) * 1000),
    },
  });
}

export async function exchangeBlingAuthorizationCode(code) {
  const tokens = await exchangeToken({ grant_type: 'authorization_code', code });
  return saveTokens(tokens);
}

export async function getBlingConnectionStatus() {
  const config = getBlingConfiguration();
  const connection = await prisma.blingConnection.findUnique({
    where: { id: connectionId },
    select: { connectedAt: true, accessTokenExpiresAt: true },
  });
  return {
    configured: config.ready,
    hasClientCredentials: config.hasClientCredentials,
    hasRedirectUri: config.hasRedirectUri,
    hasEncryptionKey: config.hasEncryptionKey,
    redirectUri: config.redirectUri,
    connected: Boolean(connection),
    connectedAt: connection?.connectedAt.toISOString() || null,
    accessTokenExpiresAt: connection?.accessTokenExpiresAt.toISOString() || null,
  };
}

async function getAccessToken() {
  const config = getBlingConfiguration();
  if (!config.ready) throw new BlingIntegrationError('A integração com o Bling ainda não está configurada.', 503);
  const connection = await prisma.blingConnection.findUnique({ where: { id: connectionId } });
  if (!connection) throw new BlingIntegrationError('Conecte uma conta Bling antes de enviar pedidos.', 409);
  if (connection.accessTokenExpiresAt.getTime() > Date.now() + 60_000) {
    return decryptToken(connection.encryptedAccessToken);
  }

  const refreshToken = decryptToken(connection.encryptedRefreshToken);
  const tokens = await exchangeToken({ grant_type: 'refresh_token', refresh_token: refreshToken });
  await saveTokens(tokens);
  return tokens.access_token;
}

export async function blingRequest(path, options = {}) {
  const token = await getAccessToken();
  const isPost = (options.method || 'GET').toUpperCase() === 'POST';
  const isUncertainMutation = isPost && (
    path === '/pedidos/vendas'
    || path === '/contatos'
    || /^\/pedidos\/vendas\/\d+\/gerar-nfce$/.test(path)
    || /^\/nfce\/\d+\/enviar$/.test(path)
  );
  let response;
  try {
    response = await fetch(`${apiBaseUrl}${path}`, {
      ...options,
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${token}`,
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
      cache: 'no-store',
    });
  } catch {
    throw new BlingIntegrationError(
      'Não foi possível confirmar a resposta do Bling. Confira a situação da operação antes de tentar novamente.',
      502,
      { uncertain: isUncertainMutation },
    );
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    const message = typeof payload?.error?.message === 'string'
      ? payload.error.message
      : typeof payload?.message === 'string' ? payload.message : '';
    console.error('A API do Bling recusou uma solicitação com status HTTP:', response.status);
    throw new BlingIntegrationError(
      message.slice(0, 300) || 'O Bling recusou o pedido. Revise os dados do cliente, itens e configurações fiscais no Bling.',
      502,
    );
  }
  return payload;
}

function normalizeDocument(value) {
  return String(value || '').replace(/\D/g, '');
}

async function findOrCreateBlingContact(order) {
  const cpf = normalizeDocument(order.includeCpfOnReceipt === true ? order.invoiceCpf : '');
  const email = String(order.customerEmail || '').trim().toLowerCase();
  if (cpf && ![11, 14].includes(cpf.length)) {
    throw new BlingIntegrationError('O CPF/CNPJ informado no pedido não tem um formato válido.', 400);
  }
  const search = cpf || email;
  if (!search) {
    throw new BlingIntegrationError('O pedido precisa ter CPF ou e-mail do cliente para localizar/criar o contato no Bling.', 400);
  }

  const query = new URLSearchParams({ pagina: '1', limite: '100', pesquisa: search, criterio: '1' });
  const result = await blingRequest(`/contatos?${query}`);
  const contacts = Array.isArray(result?.data) ? result.data : [];
  const matchingContact = contacts.find((contact) => (
    cpf
      ? normalizeDocument(contact.numeroDocumento) === cpf
      : String(contact.email || '').trim().toLowerCase() === email
  ));
  if (matchingContact?.id) return matchingContact.id;

  const name = String(order.customerName || '').trim();
  if (!name) throw new BlingIntegrationError('O pedido não tem nome de cliente para criar o contato no Bling.', 400);
  const isCompany = cpf.length === 14;
  const created = await blingRequest('/contatos', {
    method: 'POST',
    body: JSON.stringify({
      nome: name.slice(0, 120),
      tipo: isCompany ? 'J' : 'F',
      situacao: 'A',
      ...(cpf ? { numeroDocumento: cpf } : {}),
      ...(email ? { email: email.slice(0, 120) } : {}),
    }),
  });
  const contactId = created?.data?.id;
  if (!contactId) throw new BlingIntegrationError('O Bling não retornou o identificador do contato criado.', 502);
  return contactId;
}

export async function sendOrderToBling(order) {
  let payload;
  try {
    payload = buildBlingSalesOrderPayload(order, 1);
  } catch (error) {
    throw new BlingIntegrationError(error.message || 'Os dados do pedido são inválidos para o Bling.', 400);
  }
  const contactId = await findOrCreateBlingContact(order);
  payload.contato.id = Number(contactId);
  return blingRequest('/pedidos/vendas', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
