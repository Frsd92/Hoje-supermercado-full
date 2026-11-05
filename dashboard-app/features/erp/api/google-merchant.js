import { createHash, createSign } from 'node:crypto';
import { calculateSalePrice } from './product-pricing.js';
import { publicProductImage } from './product-image-url.js';

const merchantApiBase = 'https://merchantapi.googleapis.com/products/v1';
const oauthTokenUrl = 'https://oauth2.googleapis.com/token';
const accessTokenScope = 'https://www.googleapis.com/auth/content';
const tokenCache = new Map();

export function getGoogleMerchantConfig(env = process.env) {
  const accountId = env.GOOGLE_MERCHANT_ACCOUNT_ID?.trim() || '';
  const dataSource = env.GOOGLE_MERCHANT_DATA_SOURCE?.trim() || '';
  const serviceAccountJson = env.GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON?.trim() || '';
  const storeUrl = env.NEXTAUTH_URL?.trim() || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : '');
  const missing = [];

  if (!accountId) missing.push('GOOGLE_MERCHANT_ACCOUNT_ID');
  if (!dataSource) missing.push('GOOGLE_MERCHANT_DATA_SOURCE');
  if (!serviceAccountJson) missing.push('GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON');
  try {
    const parsedUrl = new URL(storeUrl);
    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
      missing.push('NEXTAUTH_URL (deve usar HTTPS)');
    }
  } catch {
    missing.push('NEXTAUTH_URL');
  }

  return {
    accountId,
    dataSource,
    serviceAccountJson,
    storeUrl: storeUrl.replace(/\/+$/, ''),
    missing: [...new Set(missing)],
  };
}

export function validateGtin(value) {
  const gtin = String(value || '').replace(/\D/g, '');
  if (![8, 12, 13, 14].includes(gtin.length)) return false;

  const digits = [...gtin].map(Number);
  const checkDigit = digits.pop();
  const weightedSum = digits.reverse().reduce((sum, digit, index) => sum + digit * (index % 2 === 0 ? 3 : 1), 0);
  return (10 - (weightedSum % 10)) % 10 === checkDigit;
}

function priceAttribute(amount) {
  return {
    amountMicros: String(Math.round(amount * 1_000_000)),
    currencyCode: 'BRL',
  };
}

function productOfferId(product) {
  return `hj-${createHash('sha256').update(String(product.id)).digest('hex').slice(0, 40)}`;
}

export function mapMerchantProduct(product, { storeUrl, now = Date.now() } = {}) {
  if (product.status !== 'Ativo') return { skipReason: 'Produto inativo no catálogo.' };
  if (!String(product.id || '').trim()) return { skipReason: 'Produto sem identificador estável no catálogo.' };

  const title = String(product.title || '').trim();
  const description = String(product.description || '').trim();
  const price = Number(product.price);
  const salePrice = calculateSalePrice(product, now);
  const quantity = Number(product.quantity);
  const imagePath = publicProductImage(product);

  if (!title) return { skipReason: 'Produto sem nome.' };
  if (!description) return { skipReason: 'Produto sem descrição.' };
  if (title.length > 150) return { skipReason: 'Nome excede o limite de 150 caracteres do Google.' };
  if (!Number.isFinite(price) || price <= 0 || !Number.isFinite(salePrice) || salePrice <= 0) {
    return { skipReason: 'Preço de venda inválido.' };
  }
  if (!Number.isFinite(quantity)) return { skipReason: 'Estoque não informado.' };
  if (!imagePath) return { skipReason: 'Produto sem imagem pública.' };

  let link;
  let imageLink;
  try {
    const baseUrl = new URL(`${storeUrl}/`);
    link = new URL(`/produto?id=${encodeURIComponent(product.id)}`, baseUrl).toString();
    imageLink = new URL(imagePath, baseUrl).toString();
  } catch {
    return { skipReason: 'URL pública da loja ou da imagem inválida.' };
  }

  const barcode = String(product.barcode || '').trim();
  if (barcode && !validateGtin(barcode)) return { skipReason: 'Código de barras inválido; corrija o GTIN no cadastro do produto.' };

  const attributes = {
    title,
    description,
    link,
    imageLink,
    availability: quantity > 0 ? 'IN_STOCK' : 'OUT_OF_STOCK',
    condition: 'NEW',
    price: priceAttribute(price),
  };
  if (salePrice < price) attributes.salePrice = priceAttribute(salePrice);
  if (product.brand) attributes.brand = String(product.brand).trim();
  if (barcode) attributes.gtin = barcode.replace(/\D/g, '');
  else attributes.identifierExists = false;

  const productType = [
    ...(Array.isArray(product.categories) ? product.categories : []),
    product.subcategory,
  ].map((value) => String(value || '').trim()).filter(Boolean).join(' > ');
  if (productType) attributes.productTypes = [productType];

  return {
    input: {
      offerId: productOfferId(product),
      contentLanguage: 'pt',
      feedLabel: 'BR',
      productAttributes: attributes,
    },
  };
}

function encodeBase64Url(value) {
  return Buffer.from(value).toString('base64url');
}

function parseServiceAccount(config) {
  let credentials;
  try {
    credentials = JSON.parse(config.serviceAccountJson);
  } catch {
    throw new Error('GOOGLE_MERCHANT_SERVICE_ACCOUNT_JSON não contém um JSON válido.');
  }
  if (credentials.type !== 'service_account' || !credentials.client_email || !credentials.private_key) {
    throw new Error('A credencial configurada não é uma chave válida de conta de serviço.');
  }
  return credentials;
}

async function getAccessToken(config) {
  const credentials = parseServiceAccount(config);
  const cached = tokenCache.get(credentials.client_email);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

  const issuedAt = Math.floor(Date.now() / 1000);
  const header = encodeBase64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = encodeBase64Url(JSON.stringify({
    iss: credentials.client_email,
    scope: accessTokenScope,
    aud: credentials.token_uri || oauthTokenUrl,
    iat: issuedAt,
    exp: issuedAt + 3600,
  }));
  const unsignedToken = `${header}.${claim}`;
  const signer = createSign('RSA-SHA256');
  signer.update(unsignedToken);
  const assertion = `${unsignedToken}.${signer.sign(credentials.private_key, 'base64url')}`;
  const response = await fetch(credentials.token_uri || oauthTokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.access_token) {
    throw new Error(`Não foi possível obter autorização do Google (HTTP ${response.status}).`);
  }
  tokenCache.set(credentials.client_email, {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in || 3600) * 1000,
  });
  return data.access_token;
}

async function merchantRequest(config, token, pathname, { method = 'GET', body } = {}) {
  const response = await fetch(`${merchantApiBase}/${pathname}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
    cache: 'no-store',
  });
  const responseBody = response.status === 204 ? '' : await response.text();
  let data = null;
  if (responseBody) {
    try {
      data = JSON.parse(responseBody);
    } catch {
      data = null;
    }
  }
  if (!response.ok) {
    const apiMessage = data?.error?.message
      || (responseBody && !data ? responseBody.replace(/\s+/g, ' ').trim().slice(0, 300) : '');
    const message = apiMessage
      ? `A Merchant API respondeu HTTP ${response.status} em ${method} ${pathname}: ${apiMessage}`
      : `A Merchant API respondeu HTTP ${response.status} em ${method} ${pathname}.`;
    throw new Error(message);
  }
  return data;
}

async function mapWithConcurrency(items, concurrency, callback) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await callback(items[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function listProductsForSource(config, token) {
  const products = [];
  let pageToken = '';
  do {
    const query = new URLSearchParams({ pageSize: '1000' });
    if (pageToken) query.set('pageToken', pageToken);
    const page = await merchantRequest(config, token, `${config.accountId}/products?${query}`);
    products.push(...(Array.isArray(page?.products) ? page.products : []));
    pageToken = page?.nextPageToken || '';
  } while (pageToken);
  return products.filter((product) => product.dataSource === config.dataSource);
}

async function removeStaleProducts(config, token, expectedOfferIds) {
  const existingProducts = await listProductsForSource(config, token);
  const staleProducts = existingProducts.filter((product) => !expectedOfferIds.has(product.offerId));
  const results = await mapWithConcurrency(staleProducts, 5, async (product) => {
    const inputId = encodeBase64Url(`${product.contentLanguage}~${product.feedLabel}~${product.offerId}`);
    const inputName = `${config.accountId}/productInputs/${inputId}`;
    const query = new URLSearchParams({ dataSource: config.dataSource });
    await merchantRequest(config, token, `${inputName}?${query}`, { method: 'DELETE' });
    return product.offerId;
  });
  return results.length;
}

export async function syncGoogleMerchantProducts(products, { config = getGoogleMerchantConfig() } = {}) {
  if (config.missing.length) {
    throw new Error(`Configure as variáveis de ambiente pendentes: ${config.missing.join(', ')}.`);
  }

  const token = await getAccessToken(config);
  const candidates = products.filter((product) => product.status === 'Ativo');
  const mapped = candidates.map((product) => ({
    product,
    ...mapMerchantProduct(product, { storeUrl: config.storeUrl }),
  }));
  const expectedOfferIds = new Set(mapped.filter((entry) => entry.input).map((entry) => entry.input.offerId));
  const skipped = mapped.filter((entry) => entry.skipReason).map((entry) => ({
    product: entry.product.title || String(entry.product.id),
    reason: entry.skipReason,
  }));
  const insertionResults = await mapWithConcurrency(
    mapped.filter((entry) => entry.input),
    5,
    async ({ product, input }) => {
      try {
        await merchantRequest(
          config,
          token,
          `${config.accountId}/productInputs:insert?${new URLSearchParams({ dataSource: config.dataSource })}`,
          { method: 'POST', body: input },
        );
        return null;
      } catch (error) {
        return { product: product.title || String(product.id), reason: error.message };
      }
    },
  );
  const insertionErrors = insertionResults.filter(Boolean);
  const errors = [...insertionErrors];
  let removed = 0;
  try {
    removed = await removeStaleProducts(config, token, expectedOfferIds);
  } catch (error) {
    errors.push({ product: 'Limpeza do catálogo', reason: error.message });
  }

  return {
    total: products.length,
    active: candidates.length,
    synced: insertionResults.length - insertionErrors.length,
    skipped,
    removed,
    errors,
    completedAt: new Date().toISOString(),
  };
}
