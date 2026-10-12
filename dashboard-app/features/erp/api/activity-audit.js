export function getAuditDevice(userAgent = '') {
  const agent = String(userAgent).slice(0, 512);
  const deviceType = /ipad|tablet|kindle|silk/i.test(agent)
    ? 'Tablet'
    : /mobile|iphone|ipod|android/i.test(agent)
      ? 'Celular'
      : agent
        ? 'Computador'
        : 'Desconhecido';
  const browser = /edg(?:e|ios|a)?\/([\d.]+)/i.test(agent)
    ? 'Edge'
    : /opr\/([\d.]+)/i.test(agent)
      ? 'Opera'
      : /(?:chrome|crios)\/([\d.]+)/i.test(agent)
        ? 'Chrome'
        : /firefox\/([\d.]+)/i.test(agent)
          ? 'Firefox'
          : /safari\/([\d.]+)/i.test(agent)
            ? 'Safari'
            : 'Desconhecido';
  const operatingSystem = /windows/i.test(agent)
    ? 'Windows'
    : /android/i.test(agent)
      ? 'Android'
      : /iphone|ipad|ipod/i.test(agent)
        ? 'iOS'
        : /mac os|macintosh/i.test(agent)
          ? 'macOS'
          : /linux/i.test(agent)
            ? 'Linux'
            : 'Desconhecido';

  return { deviceType, browser, operatingSystem };
}

export function classifyAuditAction(method, pathname) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (pathname === '/login' || pathname === '/erp/login' || pathname.startsWith('/api/auth/')) return 'AUTH';
  if (normalizedMethod === 'GET' || normalizedMethod === 'HEAD') {
    return pathname.startsWith('/api/') ? 'DATA_READ' : 'PAGE_VIEW';
  }
  if (normalizedMethod === 'POST') return 'COMMAND';
  if (normalizedMethod === 'PUT' || normalizedMethod === 'PATCH') return 'UPDATE';
  if (normalizedMethod === 'DELETE') return 'DELETE';
  return 'REQUEST';
}

export function sanitizeAuditRoute(pathname) {
  return String(pathname || '/')
    .slice(0, 300)
    .replace(/[^/]*(?:%40|@)[^/]*/gi, '[redacted]')
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[document]');
}

export function auditEventLabel(event) {
  const method = String(event.method || '').toUpperCase();
  if (event.source === 'DATABASE') {
    if (event.resourceName === 'InventoryOrderFulfillment') return 'Pedido separado / estoque baixado';
    if (event.resourceName === 'InventoryLotAllocation') return 'Lote baixado na separação';
    if (event.resourceName === 'InventoryCountItem' && event.action === 'UPDATE') return 'Contagem física registrada/alterada';
    if (event.resourceName === 'CouponRedemption') return 'Cupom resgatado';
    if (event.resourceName === 'LoyaltyMissionProgress' && event.changes?.completedAt) return 'Missão concluída';
    if (event.resourceName === 'LoyaltyMissionContribution') return 'Progresso da missão atualizado';
    if (event.resourceName === 'LoyaltyPointEntry') return 'Movimentação de pontos registrada';
    if (event.resourceName === 'LoyaltyRewardRedemption') return 'Recompensa resgatada';
    if (event.resourceName === 'OrderRefundEvent') {
      const eventAction = event.snapshot?.action;
      return ({
        requested: 'Estorno solicitado',
        approved_waiting_gateway: 'Estorno aprovado',
        gateway_processing: 'Estorno enviado para processamento',
        gateway_failed: 'Falha no processamento do estorno',
        rejected: 'Estorno recusado',
        completed: 'Estorno concluído',
      })[eventAction] || 'Etapa de estorno registrada';
    }
    if (event.resourceName === 'Order' && event.action === 'UPDATE' && event.changes?.status) return 'Etapa do pedido alterada';
    if (event.resourceName === 'ProductLot') {
      return ({
        CREATE: 'Lote de estoque cadastrado',
        UPDATE: 'Lote / saldo / validade alterado',
        DELETE: 'Lote de estoque removido',
      })[event.action] || event.action;
    }
    return ({ CREATE: 'Registro criado', UPDATE: 'Registro alterado', DELETE: 'Registro excluído' })[event.action] || event.action;
  }
  if (event.source && event.source !== 'ACCESS') {
    return ({
      CREATE: 'Cadastro criado',
      UPDATE: 'Cadastro alterado',
      DELETE: 'Cadastro excluído',
      STOCK_ADJUSTMENT: 'Estoque ajustado',
      STATUS_CHANGE: 'Etapa alterada',
      PURCHASE_RECEIPT: 'Entrada de compra registrada',
      INVENTORY_LOT_CREATED: 'Lote de estoque cadastrado',
      INVENTORY_LOT_RECEIPT: 'Saldo adicionado ao lote',
      INVENTORY_LOT_UPDATED: 'Lote / saldo / validade alterado',
      ORDER_FULFILLMENT: 'Baixa de estoque por separação',
      RECEIPT: 'Recebimento de compra registrado',
      IMPORTADA: 'NF-e importada',
      CONFERENCIA_ATUALIZADA: 'Conferência da NF-e atualizada',
      LANCAMENTO_CONFIRMADO: 'NF-e lançada no estoque',
      requested: 'Solicitação registrada',
      approved_waiting_gateway: 'Solicitação aprovada',
      gateway_processing: 'Operação encaminhada à processadora',
      gateway_failed: 'Falha da processadora registrada',
      rejected: 'Solicitação recusada',
      completed: 'Operação concluída',
    })[event.action] || event.action || 'Alteração registrada';
  }
  const actionLabels = {
    PAGE_VIEW: 'Visualização de página',
    DATA_READ: 'Consulta de dados',
    COMMAND: 'Ação solicitada',
    UPDATE: 'Alteração solicitada',
    DELETE: 'Exclusão solicitada',
    AUTH: 'Acesso/autenticação',
    REQUEST: 'Requisição',
  };
  return actionLabels[event.action] || event.action || method;
}

const businessResourceLabels = {
  Product: 'Produto',
  ProductLot: 'Lote de estoque / validade',
  ProductBarcode: 'Código de barras do produto',
  InventoryCount: 'Balanço de estoque',
  InventoryCountItem: 'Contagem de produto',
  InventoryOrderFulfillment: 'Separação de pedido',
  InventoryLotAllocation: 'Lote separado para pedido',
  Supplier: 'Fornecedor',
  PurchaseOrder: 'Ordem de compra',
  PurchaseOrderItem: 'Item da ordem de compra',
  SupplierInvoice: 'NF-e de fornecedor',
  SupplierInvoiceItem: 'Item da NF-e',
  SupplierInvoiceReceiptLot: 'Lote recebido pela NF-e',
  SupplierPayable: 'Conta a pagar de fornecedor',
  Order: 'Pedido',
  OrderItem: 'Item do pedido',
  OrderRefundRequest: 'Solicitação de estorno',
  OrderRefundEvent: 'Etapa de estorno',
  OrderServiceRequest: 'Solicitação de atendimento/cancelamento',
  CouponCampaign: 'Cupom',
  CouponRecipient: 'Destinatário de cupom',
  CouponRedemption: 'Resgate de cupom',
  LoyaltyMission: 'Missão de fidelidade',
  LoyaltyMissionProgress: 'Progresso de missão',
  LoyaltyMissionContribution: 'Contribuição para missão',
  LoyaltyReward: 'Recompensa de fidelidade',
  LoyaltyRewardRedemption: 'Resgate de recompensa',
  LoyaltyPointEntry: 'Lançamento de pontos',
  LoyaltyPointAllocation: 'Vínculo de pontos',
};

const auditModuleRoutes = {
  Product: '/erp/product-audit',
  ProductLot: '/erp/validade',
  ProductBarcode: '/erp/products',
  InventoryCount: '/erp/balanco-estoque',
  InventoryCountItem: '/erp/balanco-estoque',
  InventoryOrderFulfillment: '/erp/orders',
  InventoryLotAllocation: '/erp/orders',
  Supplier: '/erp/suppliers',
  PurchaseOrder: '/erp/suppliers/orders',
  PurchaseOrderItem: '/erp/suppliers/orders',
  SupplierInvoice: '/erp/suppliers/invoices',
  SupplierInvoiceItem: '/erp/suppliers/invoices',
  SupplierInvoiceReceiptLot: '/erp/suppliers/invoices',
  SupplierPayable: '/erp/financeiro',
  Order: '/erp/orders',
  OrderItem: '/erp/orders',
  OrderRefundRequest: '/erp/orders',
  OrderRefundEvent: '/erp/orders',
  OrderServiceRequest: '/erp/customers',
  CouponCampaign: '/erp/promotions',
  CouponRecipient: '/erp/promotions',
  CouponRedemption: '/erp/promotions',
  LoyaltyMission: '/erp/fidelidade',
  LoyaltyMissionProgress: '/erp/fidelidade',
  LoyaltyMissionContribution: '/erp/fidelidade',
  LoyaltyReward: '/erp/fidelidade',
  LoyaltyRewardRedemption: '/erp/fidelidade',
  LoyaltyPointEntry: '/erp/fidelidade',
  LoyaltyPointAllocation: '/erp/fidelidade',
};

const relatedIdLabels = {
  productId: 'Produto',
  orderId: 'Pedido',
  orderItemId: 'Item do pedido',
  supplierId: 'Fornecedor',
  purchaseOrderId: 'Ordem de compra',
  invoiceId: 'NF-e',
  campaignId: 'Cupom',
  couponCampaignId: 'Cupom',
  missionId: 'Missão',
  countId: 'Balanço de estoque',
  lotId: 'Lote',
  refundRequestId: 'Solicitação de estorno',
  progressId: 'Progresso de missão',
  sourceOrderId: 'Pedido',
  rewardId: 'Recompensa',
  rewardRedemptionId: 'Resgate de recompensa',
  redemptionEntryId: 'Lançamento de pontos',
  awardEntryId: 'Lançamento de pontos',
};

export function auditResourceLabel(entry) {
  if (entry.source === 'PRODUCT') return 'Produto';
  if (entry.source === 'SUPPLIER') return 'Fornecedor';
  if (entry.source === 'INVOICE') return 'NF-e de fornecedor';
  if (entry.source === 'PURCHASE_ORDER') return 'Ordem de compra';
  return businessResourceLabels[entry.resourceName] || entry.resourceName || entry.route || 'Registro';
}

export function auditResourceHref(entry) {
  if (entry.source === 'PRODUCT') return '/erp/product-audit';
  if (entry.source === 'SUPPLIER') return '/erp/suppliers';
  if (entry.source === 'INVOICE') return '/erp/suppliers/invoices';
  if (entry.source === 'PURCHASE_ORDER') return '/erp/suppliers/orders';
  return auditModuleRoutes[entry.resourceName] || null;
}

export function auditRelatedHref(label) {
  return ({
    Produto: '/erp/products',
    Pedido: '/erp/orders',
    'Item do pedido': '/erp/orders',
    Fornecedor: '/erp/suppliers',
    'Ordem de compra': '/erp/suppliers/orders',
    'NF-e': '/erp/suppliers/invoices',
    Cupom: '/erp/promotions',
    Missão: '/erp/fidelidade',
    'Balanço de estoque': '/erp/balanco-estoque',
    Lote: '/erp/validade',
    'Solicitação de estorno': '/erp/orders',
    'Progresso de missão': '/erp/fidelidade',
    Recompensa: '/erp/fidelidade',
    'Resgate de recompensa': '/erp/fidelidade',
    'Lançamento de pontos': '/erp/fidelidade',
  })[label] || null;
}

export function auditRelatedRecords(entry) {
  const values = new Map();
  const readRelations = (record) => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) return;
    for (const [field, label] of Object.entries(relatedIdLabels)) {
      const value = record[field];
      if (typeof value === 'string' && value.trim()) values.set(`${label}:${value}`, { label, id: value });
    }
  };

  readRelations(entry.snapshot);
  if (entry.changes && typeof entry.changes === 'object') {
    const latest = Object.fromEntries(Object.entries(entry.changes).map(([field, change]) => [
      field,
      change?.after && change.after.__auditAbsent !== true
        ? change.after
        : change?.before,
    ]));
    readRelations(latest);
  }
  return [...values.values()].filter(({ id }) => id !== entry.resourceId);
}

export function sanitizeAuditDetail(value, fieldName = '') {
  const sensitiveField = fieldName !== 'logoPresent'
    && /(password|passphrase|secret|token|credential|authorization|api[_-]?key|private[_-]?key|cvv|security[_-]?code|card|image|photo|logo|xml|danfe|binary|filedata)/i.test(fieldName);
  if (sensitiveField) {
    const protectedValue = (candidate) => candidate === null || candidate === undefined || candidate === ''
      ? candidate
      : '[Conteúdo protegido; alteração registrada]';
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      return {
        ...value,
        ...(Object.hasOwn(value, 'before') ? { before: protectedValue(value.before) } : {}),
        ...(Object.hasOwn(value, 'after') ? { after: protectedValue(value.after) } : {}),
        ...(Object.hasOwn(value, 'before') || Object.hasOwn(value, 'after') ? { redacted: true } : {}),
      };
    }
    return protectedValue(value);
  }
  if (Array.isArray(value)) return value.map((item) => sanitizeAuditDetail(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, nestedValue]) => [
      key,
      sanitizeAuditDetail(nestedValue, key),
    ]));
  }
  if (typeof value === 'string' && value.startsWith('data:image/')) return '[Imagem registrada; conteúdo protegido]';
  if (typeof value === 'string' && value.length > 4096) return '[Conteúdo omitido por exceder o limite de auditoria]';
  return value;
}
