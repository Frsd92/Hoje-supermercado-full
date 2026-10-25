const officialNcmUrl = 'https://portalunico.siscomex.gov.br/classif/api/publico/nomenclatura/download/json';

export function normalizeNcmCode(value) {
  const raw = String(value || '').trim();
  if (!/^[\d.\s-]+$/.test(raw)) return '';
  return raw.replace(/\D/g, '');
}

export function activeNcmEntries(table, today = new Date()) {
  if (!Array.isArray(table?.Nomenclaturas)) {
    throw new Error('A tabela oficial da NCM retornou um formato inesperado.');
  }
  const date = today.toISOString().slice(0, 10);
  return table.Nomenclaturas
    .filter((entry) => {
      const code = normalizeNcmCode(entry?.Codigo);
      const endDate = String(entry?.Data_Fim || '');
      return /^\d{8}$/.test(code) && (!endDate || endDate >= date);
    })
    .map((entry) => ({
      code: normalizeNcmCode(entry.Codigo),
      description: String(entry.Descricao || '').trim(),
    }));
}

export function findNcmEntries(entries, search, limit = 20) {
  const normalized = String(search || '').trim().toLocaleLowerCase('pt-BR');
  if (normalized.length < 2) return [];
  const codeQuery = normalizeNcmCode(normalized);
  return entries
    .filter((entry) => (codeQuery && entry.code.includes(codeQuery))
      || entry.description.toLocaleLowerCase('pt-BR').includes(normalized))
    .slice(0, limit);
}

export function matchNcmXmlItems(items, { barcode = '', sku = '' } = {}) {
  const productBarcode = normalizeNcmProductCode(barcode);
  const productSku = String(sku || '').trim().toLocaleLowerCase('pt-BR');
  return items.map((item) => {
    const ean = normalizeNcmProductCode(item.ean);
    const supplierCode = String(item.supplierProductCode || '').trim().toLocaleLowerCase('pt-BR');
    const matchType = productBarcode && ean === productBarcode
      ? 'barcode'
      : productSku && supplierCode === productSku
        ? 'sku'
        : null;
    return {
      description: item.description,
      ean: item.ean,
      supplierProductCode: item.supplierProductCode,
      ncm: normalizeNcmCode(item.ncm),
      matchType,
    };
  });
}

function normalizeNcmProductCode(value) {
  return String(value || '').replace(/\D/g, '');
}

export async function fetchOfficialNcmTable(fetcher = fetch) {
  let lastCause;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(officialNcmUrl, {
        headers: { Accept: 'application/json' },
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) {
        const error = new Error(`A consulta à tabela oficial da NCM falhou (HTTP ${response.status}).`);
        error.status = response.status;
        throw error;
      }
      const table = await response.json();
      activeNcmEntries(table);
      return table;
    } catch (cause) {
      lastCause = cause;
      if (cause?.status && cause.status < 500 && cause.status !== 429) break;
      if (attempt === 0) await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }
  const error = new Error('Não foi possível consultar a tabela vigente oficial da NCM.', { cause: lastCause });
  error.status = 502;
  throw error;
}

export async function validateActiveNcm(value) {
  const code = normalizeNcmCode(value);
  if (!/^\d{8}$/.test(code)) {
    return { valid: false, code, description: '', error: 'O NCM deve conter exatamente 8 dígitos.' };
  }
  const table = await fetchOfficialNcmTable();
  const entry = activeNcmEntries(table).find((item) => item.code === code);
  return entry
    ? { valid: true, ...entry, updatedAt: table.Data_Ultima_Atualizacao_NCM || null }
    : { valid: false, code, description: '', error: 'Este código não consta como vigente na tabela oficial da NCM.' };
}

export async function validateChangedProductNcm(product, before) {
  const code = String(product.ncm || '').trim();
  if (!code || code === String(before?.ncm || '').trim()) return;
  const result = await validateActiveNcm(code);
  if (!result.valid) {
    const error = new Error(result.error);
    error.status = 422;
    throw error;
  }
}

export const officialNcmSourceUrl = officialNcmUrl;
