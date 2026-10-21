function parseOrderAmount(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN;
  const text = String(value ?? '').trim().replace(/[^\d,.-]/g, '');
  const normalized = text.includes(',')
    ? text.replace(/\./g, '').replace(',', '.')
    : text;
  return Number(normalized);
}

function orderDate(value) {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) throw new Error('A data do pedido é inválida.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function buildBlingSalesOrderPayload(order, contactId) {
  const date = orderDate(order.createdAt);
  const total = parseOrderAmount(order.total);
  if (!Number.isFinite(total) || total <= 0) throw new Error('O total do pedido não é válido para envio ao Bling.');
  if (!Array.isArray(order.items) || !order.items.length) throw new Error('O pedido não tem itens para enviar ao Bling.');

  const items = order.items.map((item) => {
    const quantity = Number(item.quantity);
    const price = parseOrderAmount(item.price);
    if (!Number.isFinite(quantity) || quantity <= 0 || !Number.isFinite(price) || price <= 0) {
      throw new Error(`O item “${item.name || 'sem nome'}” tem quantidade ou preço inválido.`);
    }
    return {
      ...(item.productCode ? { codigo: String(item.productCode).slice(0, 60) } : {}),
      unidade: item.unit === 'kg' ? 'KG' : 'UN',
      quantidade: quantity,
      desconto: 0,
      valor: price,
      aliquotaIPI: 0,
      descricao: String(item.name || 'Produto').slice(0, 120),
      descricaoDetalhada: `Pedido da loja Hoje ${order.id}`,
    };
  });

  const freight = Number(order.deliveryFee || 0);
  const serviceFee = Number(order.serviceFee || 0);
  const discount = Number(order.couponDiscountAmount || 0);
  const contact = Number(contactId);
  if (!Number.isSafeInteger(contact) || contact <= 0) throw new Error('O contato do pedido não pôde ser identificado no Bling.');

  return {
    numeroLoja: `HOJE-${String(order.id).slice(0, 42)}`,
    data: date,
    dataSaida: date,
    dataPrevista: date,
    contato: { id: contact },
    ...(serviceFee > 0 ? { outrasDespesas: serviceFee } : {}),
    ...(discount > 0 ? { desconto: { valor: discount, unidade: 'REAL' } } : {}),
    observacoes: [
      `Pedido enviado manualmente pelo ERP Hoje. Referência: ${order.id}`,
      order.address ? `Endereço de entrega: ${String(order.address).slice(0, 150)}` : '',
      order.paymentMethod ? `Forma de pagamento informada: ${String(order.paymentMethod).slice(0, 50)}` : '',
    ].filter(Boolean).join('\n'),
    itens: items,
    parcelas: [{ dataVencimento: date, valor: total }],
    ...(freight > 0 ? { transporte: { fretePorConta: 0, frete: freight } } : {}),
  };
}
