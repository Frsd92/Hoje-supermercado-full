import { XMLParser, XMLValidator } from 'fast-xml-parser';

const parser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  parseAttributeValue: false,
  parseTagValue: false,
  processEntities: false,
  removeNSPrefix: true,
  trimValues: true,
});

const digits = (value) => String(value || '').replace(/\D/g, '');
const text = (value) => typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';

function list(value) {
  if (value === null || value === undefined || value === '') return [];
  return Array.isArray(value) ? value : [value];
}

function decimal(value, label, { positive = false, places = 6 } = {}) {
  const raw = text(value);
  if (!new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`).test(raw)) {
    throw new Error(`O campo ${label} da NF-e está inválido.`);
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || (positive && parsed <= 0)) {
    throw new Error(`O campo ${label} da NF-e está inválido.`);
  }
  return raw;
}

function parseDate(value, label) {
  const raw = text(value);
  if (!raw) throw new Error(`A NF-e não contém ${label}.`);
  const date = new Date(raw.length === 10 ? `${raw}T12:00:00-03:00` : raw);
  if (Number.isNaN(date.getTime())) throw new Error(`A data de ${label} da NF-e está inválida.`);
  return date;
}

function checkAccessKey(accessKey) {
  if (!/^\d{44}$/.test(accessKey)) return false;
  const digitsBeforeCheck = accessKey.slice(0, 43);
  let weight = 2;
  let sum = 0;
  for (let index = digitsBeforeCheck.length - 1; index >= 0; index -= 1) {
    sum += Number(digitsBeforeCheck[index]) * weight;
    weight = weight === 9 ? 2 : weight + 1;
  }
  const remainder = sum % 11;
  const checkDigit = remainder < 2 ? 0 : 11 - remainder;
  return Number(accessKey[43]) === checkDigit;
}

function requiredObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`O XML não contém uma estrutura ${label} válida.`);
  }
  return value;
}

export function parseSupplierInvoiceXml(xmlText) {
  if (typeof xmlText !== 'string' || !xmlText.trim() || xmlText.length > 5_000_000) {
    throw new Error('Envie um XML de NF-e válido com até 5 MB.');
  }
  if (/<!DOCTYPE|<!ENTITY/i.test(xmlText)) {
    throw new Error('O XML contém declarações não permitidas.');
  }
  const validation = XMLValidator.validate(xmlText, { allowBooleanAttributes: false });
  if (validation !== true) throw new Error('O arquivo não contém um XML bem-formado de NF-e.');

  let parsed;
  try {
    parsed = parser.parse(xmlText);
  } catch {
    throw new Error('Não foi possível interpretar o XML da NF-e.');
  }

  const processedInvoice = parsed.nfeProc?.NFe || parsed.NFe;
  const invoice = requiredObject(processedInvoice, 'NF-e');
  const info = requiredObject(invoice.infNFe, 'infNFe');
  const identification = requiredObject(info.ide, 'ide');
  const issuer = requiredObject(info.emit, 'emit');
  const recipient = info.dest && typeof info.dest === 'object' ? info.dest : {};
  const accessKey = digits(info['@_Id']).replace(/^NFE/i, '');
  if (!checkAccessKey(accessKey)) throw new Error('A chave de acesso da NF-e está ausente ou inválida.');
  if (text(identification.mod) !== '55') throw new Error('O XML informado não é uma NF-e modelo 55.');

  const issuerTaxId = digits(issuer.CNPJ || issuer.CPF);
  if (!issuerTaxId || accessKey.slice(6, 20) !== issuerTaxId.padStart(14, '0')) {
    throw new Error('O CNPJ/CPF do emitente não corresponde à chave de acesso da NF-e.');
  }

  const protocol = parsed.nfeProc?.protNFe?.infProt || null;
  const protocolKey = digits(protocol?.chNFe);
  if (protocolKey && protocolKey !== accessKey) throw new Error('A chave do protocolo não corresponde à chave da NF-e.');
  const protocolStatus = text(protocol?.cStat) || null;
  const authorized = protocolStatus === '100'
    && protocolKey === accessKey
    && Boolean(text(protocol?.nProt))
    && Boolean(text(protocol?.dhRecbto));

  const details = list(info.det);
  if (!details.length || details.length > 500) throw new Error('A NF-e precisa conter entre 1 e 500 itens.');
  const items = details.map((detail, index) => {
    const product = requiredObject(detail?.prod, `det/${index + 1}/prod`);
    const lineNumber = Number(text(detail['@_nItem'])) || index + 1;
    const quantity = decimal(product.qCom, `quantidade do item ${lineNumber}`, { positive: true });
    const unitPrice = decimal(product.vUnCom, `preço unitário do item ${lineNumber}`);
    const lineTotal = decimal(product.vProd, `total do item ${lineNumber}`);
    return {
      lineNumber,
      supplierProductCode: text(product.cProd).slice(0, 100),
      ean: digits(product.cEAN || product.cEANTrib),
      description: text(product.xProd).slice(0, 300),
      ncm: digits(product.NCM),
      cfop: digits(product.CFOP),
      unit: text(product.uCom).slice(0, 12),
      invoiceQuantity: quantity,
      unitPrice,
      lineTotal: lineTotal ? Number(lineTotal).toFixed(2) : '0.00',
      lots: list(product.rastro).map((lot) => ({
        lotCode: text(lot.nLote).slice(0, 80),
        quantity: decimal(lot.qLote, `quantidade do lote do item ${lineNumber}`, { positive: true, places: 6 }),
        expiry: text(lot.dVal),
        manufactureDate: text(lot.dFab),
      })),
    };
  });

  const total = decimal(info.total?.ICMSTot?.vNF, 'valor total', { places: 2 });
  const billingInstallments = list(info.cobr?.dup).map((installment, index) => ({
    code: text(installment.nDup) || String(index + 1).padStart(3, '0'),
    dueAt: text(installment.dVenc) || null,
    amount: decimal(installment.vDup, `valor da duplicata ${index + 1}`, { places: 2 }),
  }));
  const purchaseDate = parseDate(identification.dhEmi || identification.dEmi, 'emissão');
  const authorizedAt = protocol?.dhRecbto ? parseDate(protocol.dhRecbto, 'autorização') : null;

  return {
    accessKey,
    invoiceNumber: text(identification.nNF),
    series: text(identification.serie),
    issuerTaxId,
    issuerName: text(issuer.xNome).slice(0, 200),
    recipientTaxId: digits(recipient.CNPJ || recipient.CPF) || null,
    issuedAt: purchaseDate,
    authorizedAt,
    protocolNumber: text(protocol?.nProt) || null,
    protocolStatus,
    authorized,
    authorizationDataComplete: authorized,
    total,
    items,
    installments: billingInstallments,
  };
}

export function matchInvoiceProducts(invoiceItems, products) {
  const indexes = new Map();
  const ambiguous = new Set();
  for (const product of products) {
    for (const barcode of [product.barcode, ...(product.productBarcodes || []).map((entry) => entry.code)]) {
      const normalized = digits(barcode);
      if (!normalized || ambiguous.has(normalized)) continue;
      if (indexes.has(normalized) && indexes.get(normalized) !== product.id) {
        indexes.delete(normalized);
        ambiguous.add(normalized);
      } else {
        indexes.set(normalized, product.id);
      }
    }
  }
  return invoiceItems.map((item) => ({
    ...item,
    productId: indexes.get(item.ean) || null,
  }));
}

export function invoiceAuditSnapshot(invoice) {
  return {
    accessKey: invoice.accessKey,
    invoiceNumber: invoice.invoiceNumber,
    series: invoice.series,
    issuerTaxId: invoice.issuerTaxId,
    issuerName: invoice.issuerName,
    protocolNumber: invoice.protocolNumber,
    protocolStatus: invoice.protocolStatus,
    authorizationDataComplete: invoice.authorizationDataComplete === true,
    supplierId: invoice.supplierId,
    purchaseOrderId: invoice.purchaseOrderId,
    issuedAt: invoice.issuedAt instanceof Date ? invoice.issuedAt.toISOString() : invoice.issuedAt,
    total: Number(invoice.total),
    status: invoice.status,
    postedAt: invoice.postedAt instanceof Date ? invoice.postedAt.toISOString() : invoice.postedAt || null,
    items: (invoice.items || []).map((item) => ({
      lineNumber: item.lineNumber,
      supplierProductCode: item.supplierProductCode,
      ean: item.ean,
      description: item.description,
      invoiceQuantity: Number(item.invoiceQuantity),
      productId: item.productId,
      acceptedQuantity: Number(item.acceptedQuantity),
      missingQuantity: Number(item.missingQuantity),
      damagedQuantity: Number(item.damagedQuantity),
      returnedQuantity: Number(item.returnedQuantity),
      approvedUnitCost: item.approvedUnitCost === null ? null : Number(item.approvedUnitCost),
      lotCode: item.lotCode,
      expiry: item.expiry,
      manufactureDate: item.manufactureDate,
      discrepancyNote: item.discrepancyNote,
      receiptLots: (item.receiptLots || []).map((lot) => ({
        quantity: Number(lot.quantity),
        lotCode: lot.lotCode,
        expiry: lot.expiry ? new Date(lot.expiry).toISOString().slice(0, 10) : null,
        manufactureDate: lot.manufactureDate ? new Date(lot.manufactureDate).toISOString().slice(0, 10) : null,
        location: lot.location,
      })),
    })),
    payables: (invoice.payables || []).map((payable) => ({
      installment: payable.installment,
      amount: Number(payable.amount),
      dueAt: payable.dueAt ? new Date(payable.dueAt).toISOString().slice(0, 10) : null,
      status: payable.status,
      paidAt: payable.paidAt?.toISOString?.() || payable.paidAt || null,
      paymentMethod: payable.paymentMethod,
      paymentReference: payable.paymentReference,
      notes: payable.notes,
    })),
  };
}

export function supplierInvoiceQuery({ includeAudit = false } = {}) {
  return {
    select: {
      id: true,
      accessKey: true,
      invoiceNumber: true,
      series: true,
      issuerTaxId: true,
      issuerName: true,
      recipientTaxId: true,
      issuedAt: true,
      authorizedAt: true,
      protocolNumber: true,
      protocolStatus: true,
      authorizationDataComplete: true,
      total: true,
      status: true,
      supplierId: true,
      purchaseOrderId: true,
      danfeFileName: true,
      importedBy: true,
      importedAt: true,
      postedBy: true,
      postedAt: true,
      supplier: { select: { id: true, name: true, taxId: true } },
      purchaseOrder: { select: { id: true, code: true, status: true } },
      items: {
        select: {
          id: true,
          lineNumber: true,
          supplierProductCode: true,
          ean: true,
          description: true,
          ncm: true,
          cfop: true,
          unit: true,
          invoiceQuantity: true,
          invoiceLots: true,
          unitPrice: true,
          lineTotal: true,
          productId: true,
          acceptedQuantity: true,
          missingQuantity: true,
          damagedQuantity: true,
          returnedQuantity: true,
          approvedUnitCost: true,
          lotCode: true,
          expiry: true,
          manufactureDate: true,
          discrepancyNote: true,
          product: {
            select: { id: true, title: true, sku: true, barcode: true, status: true, quantity: true, cost: true, metadata: true },
          },
          receiptLots: {
            select: { id: true, quantity: true, lotCode: true, expiry: true, manufactureDate: true, location: true },
          },
        },
        orderBy: { lineNumber: 'asc' },
      },
      payables: {
        select: {
          id: true,
          installment: true,
          amount: true,
          dueAt: true,
          status: true,
          paidAt: true,
          paymentMethod: true,
          paymentReference: true,
          notes: true,
        },
        orderBy: [{ dueAt: 'asc' }, { installment: 'asc' }],
      },
      ...(includeAudit ? {
        auditLogs: {
          select: { id: true, action: true, actor: true, occurredAt: true, note: true, snapshot: true, changes: true },
          orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
          take: 100,
        },
      } : {}),
    },
  };
}

export function supplierInvoiceView(invoice) {
  return {
    id: invoice.id,
    accessKey: invoice.accessKey,
    invoiceNumber: invoice.invoiceNumber,
    series: invoice.series,
    issuerTaxId: invoice.issuerTaxId,
    issuerName: invoice.issuerName,
    recipientTaxId: invoice.recipientTaxId,
    issuedAt: invoice.issuedAt?.toISOString?.() || invoice.issuedAt,
    authorizedAt: invoice.authorizedAt?.toISOString?.() || invoice.authorizedAt || null,
    protocolNumber: invoice.protocolNumber,
    protocolStatus: invoice.protocolStatus,
    authorizationDataComplete: invoice.authorizationDataComplete === true,
    total: Number(invoice.total),
    status: invoice.status,
    supplierId: invoice.supplierId,
    supplier: invoice.supplier ? { id: invoice.supplier.id, name: invoice.supplier.name, taxId: invoice.supplier.taxId } : null,
    purchaseOrderId: invoice.purchaseOrderId,
    purchaseOrder: invoice.purchaseOrder ? { id: invoice.purchaseOrder.id, code: invoice.purchaseOrder.code, status: invoice.purchaseOrder.status } : null,
    danfeFileName: invoice.danfeFileName,
    importedBy: invoice.importedBy,
    importedAt: invoice.importedAt?.toISOString?.() || invoice.importedAt,
    postedBy: invoice.postedBy,
    postedAt: invoice.postedAt?.toISOString?.() || invoice.postedAt || null,
    items: (invoice.items || []).map((item) => ({
      id: item.id,
      lineNumber: item.lineNumber,
      supplierProductCode: item.supplierProductCode,
      ean: item.ean,
      description: item.description,
      ncm: item.ncm,
      cfop: item.cfop,
      unit: item.unit,
      invoiceQuantity: Number(item.invoiceQuantity),
      invoiceLots: item.invoiceLots || [],
      unitPrice: Number(item.unitPrice),
      lineTotal: Number(item.lineTotal),
      productId: item.productId,
      product: item.product ? {
        id: item.product.id,
        title: item.product.title,
        sku: item.product.sku,
        barcode: item.product.barcode,
        quantity: Number(item.product.quantity),
        cost: Number(item.product.cost),
        saleUnit: item.product.metadata?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade',
        controlsLot: item.product.metadata?.controlsLot === true,
        controlsExpiry: item.product.metadata?.controlsExpiry === true || item.product.metadata?.perishable === true,
        location: item.product.metadata?.location || '',
      } : null,
      acceptedQuantity: Number(item.acceptedQuantity),
      missingQuantity: Number(item.missingQuantity),
      damagedQuantity: Number(item.damagedQuantity),
      returnedQuantity: Number(item.returnedQuantity),
      approvedUnitCost: item.approvedUnitCost === null ? null : Number(item.approvedUnitCost),
      discrepancyNote: item.discrepancyNote,
      receiptLots: (item.receiptLots || []).map((lot) => ({
        id: lot.id,
        quantity: Number(lot.quantity),
        lotCode: lot.lotCode || '',
        expiry: lot.expiry ? new Date(lot.expiry).toISOString().slice(0, 10) : '',
        manufactureDate: lot.manufactureDate ? new Date(lot.manufactureDate).toISOString().slice(0, 10) : '',
        location: lot.location || '',
      })),
    })),
    payables: (invoice.payables || []).map((payable) => ({
      id: payable.id,
      installment: payable.installment,
      amount: Number(payable.amount),
      dueAt: payable.dueAt ? new Date(payable.dueAt).toISOString().slice(0, 10) : '',
      status: payable.status,
      paidAt: payable.paidAt?.toISOString?.() || payable.paidAt || null,
      paymentMethod: payable.paymentMethod,
      paymentReference: payable.paymentReference,
      notes: payable.notes,
    })),
    auditLogs: (invoice.auditLogs || []).map((entry) => ({
      id: entry.id,
      action: entry.action,
      actor: entry.actor,
      occurredAt: entry.occurredAt?.toISOString?.() || entry.occurredAt,
      note: entry.note,
      snapshot: entry.snapshot,
      changes: entry.changes,
    })),
  };
}
