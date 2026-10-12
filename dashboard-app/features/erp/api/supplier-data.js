const statuses = new Set(['Em Análise', 'Ativo', 'Inativo']);

export const supplierFields = [
  'name',
  'legalName',
  'taxId',
  'email',
  'phone',
  'whatsapp',
  'categories',
  'status',
  'statusReason',
  'contactName',
  'contactRole',
  'contactEmail',
  'contactPhone',
  'financeContact',
  'financeEmail',
  'financePhone',
  'address',
  'addressNumber',
  'neighborhood',
  'city',
  'state',
  'postalCode',
  'paymentTerms',
  'minimumOrderValue',
  'deliveryTerms',
  'acceptsExpiredProductExchange',
  'acceptsDamagedProductExchange',
];

const text = (value) => {
  if (value === undefined || value === null) return '';
  return String(value).trim();
};

export function normalizeSupplierName(value) {
  return text(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

export function normalizeSupplierTaxId(value) {
  return text(value).replace(/\D/g, '');
}

function hasValidCpf(digits) {
  if (digits.length !== 11 || /^(\d)\1{10}$/.test(digits)) return false;
  const checkDigit = (length) => {
    const sum = digits.slice(0, length).split('').reduce((total, digit, index) => (
      total + Number(digit) * (length + 1 - index)
    ), 0);
    const remainder = (sum * 10) % 11;
    return String(remainder === 10 ? 0 : remainder);
  };
  return checkDigit(9) === digits[9] && checkDigit(10) === digits[10];
}

function hasValidCnpj(digits) {
  if (digits.length !== 14 || /^(\d)\1{13}$/.test(digits)) return false;
  const calculateDigit = (base, weights) => {
    const remainder = base.split('').reduce((sum, digit, index) => sum + Number(digit) * weights[index], 0) % 11;
    return String(remainder < 2 ? 0 : 11 - remainder);
  };
  const first = calculateDigit(digits.slice(0, 12), [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  const second = calculateDigit(`${digits.slice(0, 12)}${first}`, [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]);
  return first === digits[12] && second === digits[13];
}

export function validateSupplier(input) {
  const name = text(input?.name);
  if (!name) return { error: 'Informe a razão/nome do fornecedor.' };

  const taxId = normalizeSupplierTaxId(input?.taxId);
  if (taxId && !hasValidCpf(taxId) && !hasValidCnpj(taxId)) {
    return { error: 'Informe um CPF ou CNPJ válido, ou deixe o campo vazio.' };
  }

  const email = text(input?.email).toLowerCase();
  const contactEmail = text(input?.contactEmail).toLowerCase();
  const financeEmail = text(input?.financeEmail).toLowerCase();
  for (const value of [email, contactEmail, financeEmail]) {
    if (value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
      return { error: 'Confira os endereços de e-mail informados.' };
    }
  }

  const status = text(input?.status) || 'Em Análise';
  if (!statuses.has(status)) return { error: 'Selecione um status válido para o fornecedor.' };

  const minimumOrderValue = text(input?.minimumOrderValue);
  const normalizedMinimumOrderValue = minimumOrderValue.includes(',')
    ? minimumOrderValue.replace(/\./g, '').replace(',', '.')
    : minimumOrderValue;
  const parsedMinimumOrderValue = minimumOrderValue ? Number(normalizedMinimumOrderValue) : null;
  if (parsedMinimumOrderValue !== null && (
    !/^\d+(?:\.\d{1,2})?$/.test(normalizedMinimumOrderValue)
    || !Number.isFinite(parsedMinimumOrderValue)
    || parsedMinimumOrderValue > 9_999_999_999.99
  )) {
    return { error: 'Informe o pedido mínimo em reais, com até duas casas decimais (ex.: 1.234,56).' };
  }

  const state = text(input?.state).toUpperCase();
  if (state && !/^[A-Z]{2}$/.test(state)) return { error: 'Informe a UF com duas letras.' };
  const postalCode = text(input?.postalCode).replace(/\D/g, '');
  if (postalCode && postalCode.length !== 8) return { error: 'Informe um CEP com oito dígitos.' };
  const logoData = input?.logoData;
  if (logoData !== undefined && logoData !== null && logoData !== '') {
    const match = typeof logoData === 'string'
      ? logoData.match(/^data:image\/(webp|png|jpeg);base64,([A-Za-z0-9+/]+={0,2})$/)
      : null;
    if (!match || logoData.length > 350_000 || match[2].length % 4 !== 0) {
      return { error: 'A logo deve ser uma imagem WEBP, PNG ou JPEG de até 256 KB.' };
    }
  }

  const categories = [...new Set((Array.isArray(input?.categories) ? input.categories : [])
    .map((category) => text(category))
    .filter(Boolean))];

  const data = {
    identityName: normalizeSupplierName(name),
    identityTaxId: taxId || null,
    name,
    legalName: text(input?.legalName) || null,
    taxId: taxId || null,
    email: email || null,
    phone: text(input?.phone) || null,
    whatsapp: text(input?.whatsapp) || null,
    categories,
    status,
    statusReason: text(input?.statusReason) || null,
    contactName: text(input?.contactName) || null,
    contactRole: text(input?.contactRole) || null,
    contactEmail: contactEmail || null,
    contactPhone: text(input?.contactPhone) || null,
    financeContact: text(input?.financeContact) || null,
    financeEmail: financeEmail || null,
    financePhone: text(input?.financePhone) || null,
    address: text(input?.address) || null,
    addressNumber: text(input?.addressNumber) || null,
    neighborhood: text(input?.neighborhood) || null,
    city: text(input?.city) || null,
    state: state || null,
    postalCode: postalCode || null,
    paymentTerms: text(input?.paymentTerms) || null,
    minimumOrderValue: parsedMinimumOrderValue,
    deliveryTerms: text(input?.deliveryTerms) || null,
    acceptsExpiredProductExchange: input?.acceptsExpiredProductExchange === true,
    acceptsDamagedProductExchange: input?.acceptsDamagedProductExchange === true,
  };
  if (logoData !== undefined) {
    data.logoData = logoData || null;
    data.logoMimeType = logoData ? `image/${logoData.match(/^data:image\/(webp|png|jpeg);/)[1]}` : null;
  }
  return { data };
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value.toNumber === 'function') return value.toNumber();
  if (value && typeof value === 'object' && !(value instanceof Date)) {
    return Object.fromEntries(Object.keys(value).filter((key) => value[key] !== undefined).sort().map((key) => [key, stableValue(value[key])]));
  }
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function supplierSnapshot(supplier) {
  return JSON.parse(JSON.stringify(stableValue(supplier)));
}

export function supplierChanges(before, after) {
  const previous = supplierSnapshot(before);
  const next = supplierSnapshot(after);
  const keys = [...new Set([...Object.keys(previous), ...Object.keys(next)])].sort();
  return Object.fromEntries(keys.filter((key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]))
    .map((key) => [key, {
      before: Object.hasOwn(previous, key) ? previous[key] : { __auditAbsent: true },
      after: Object.hasOwn(next, key) ? next[key] : { __auditAbsent: true },
    }]));
}

export function supplierAuditSnapshot(supplier) {
  const auditableSupplier = Object.fromEntries(Object.entries(supplier)
    .filter(([key]) => !['identityName', 'identityTaxId', 'logoData', 'logoMimeType'].includes(key)));
  return {
    ...supplierSnapshot(auditableSupplier),
    logoPresent: typeof supplier.logoPresent === 'boolean'
      ? supplier.logoPresent
      : Boolean(supplier.logoData || supplier.logoMimeType),
  };
}
