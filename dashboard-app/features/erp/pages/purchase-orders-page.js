'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Check, ExternalLink, Mail, Plus, Search, Truck, X } from 'lucide-react';
import { expiryDateFromShelfLife } from '../api/inventory-lots.js';

const orderStatuses = ['Todos', 'Pendentes', 'Rascunho', 'Aguardando Confirmação', 'Confirmado', 'Em Trânsito', 'Em Atraso', 'Recebido', 'Cancelado'];
const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const decimalInput = (value) => String(value ?? '').replace(',', '.');
const localDate = (value) => {
  if (!value) return '';
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(value));
  return `${parts.find((part) => part.type === 'year')?.value}-${parts.find((part) => part.type === 'month')?.value}-${parts.find((part) => part.type === 'day')?.value}`;
};
const displayDate = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : 'Sem previsão';
const dateTime = (value) => value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value)) : '—';

function CreatePurchaseOrder({ suppliers, products, onClose, onSaved }) {
  const [supplierId, setSupplierId] = useState('');
  const [expectedDelivery, setExpectedDelivery] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState([{ productId: '', quantity: '1', unitPrice: '' }]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const supplier = suppliers.find((item) => item.id === supplierId);
  const total = items.reduce((sum, item) => sum + (Number(item.quantity) || 0) * (Number(decimalInput(item.unitPrice)) || 0), 0);
  const updateItem = (index, field, value) => setItems((current) => current.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    if (field === 'productId') {
      const product = products.find((candidate) => candidate.id === value);
      return { ...item, productId: value, unitPrice: product ? String(product.cost ?? 0) : '' };
    }
    return { ...item, [field]: value };
  }));
  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/erp/purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplierId, expectedDelivery, notes, items }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível criar o pedido.');
      onSaved(data.order);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível criar o pedido.');
    } finally {
      setSaving(false);
    }
  };

  return <div className="supplier-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="supplier-drawer purchase-order-drawer" role="dialog" aria-modal="true" aria-labelledby="purchase-order-form-title">
      <header className="supplier-drawer-header"><div><span className="eyebrow">Compras e abastecimento</span><h2 id="purchase-order-form-title">Nova ordem de compra</h2><p>O pedido será salvo como rascunho. Ele só entra nas compras emitidas após envio para confirmação.</p></div><button type="button" className="supplier-close-button" aria-label="Fechar formulário" onClick={onClose}><X size={20} /></button></header>
      <form className="supplier-form" onSubmit={save}>
        <section className="supplier-form-section"><h3>Fornecedor e entrega</h3><div className="supplier-form-grid">
          <label>Fornecedor ativo<select value={supplierId} required onChange={(event) => setSupplierId(event.target.value)}><option value="">Selecione</option>{suppliers.filter((item) => item.status === 'Ativo').map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
          <label>Data prevista de entrega<input type="date" value={expectedDelivery} onChange={(event) => setExpectedDelivery(event.target.value)} /></label>
          <label className="supplier-form-wide">Observações<textarea rows="2" value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Condições negociadas ou referência real da compra" /></label>
        </div>{supplier?.minimumOrderValue !== null && supplier?.minimumOrderValue !== undefined && total < Number(supplier.minimumOrderValue) && <p className="purchase-order-warning">O total atual ({money(total)}) está abaixo do pedido mínimo cadastrado ({money(supplier.minimumOrderValue)}). Confirme as condições antes de enviar.</p>}</section>
        <section className="supplier-form-section"><h3>Produtos cadastrados</h3>{items.map((item, index) => <div className="purchase-order-item-form" key={index}>
          <label>Produto<select required value={item.productId} onChange={(event) => updateItem(index, 'productId', event.target.value)}><option value="">Selecione um produto</option>{products.filter((product) => product.status === 'Ativo').map((product) => <option key={product.id} value={product.id}>{product.title} · {product.sku || product.id}</option>)}</select></label>
          <label>Quantidade{products.find((product) => product.id === item.productId)?.saleUnit === 'Quilograma' ? ' (kg)' : ''}<input required min="0.001" step="0.001" type="number" value={item.quantity} onChange={(event) => updateItem(index, 'quantity', event.target.value)} /></label>
          <label>Custo unitário (R$)<input required min="0" step="0.01" type="number" value={item.unitPrice} onChange={(event) => updateItem(index, 'unitPrice', event.target.value)} /></label>
          <button type="button" className="supplier-secondary-button" disabled={items.length === 1} aria-label="Remover item" onClick={() => setItems((current) => current.filter((_, itemIndex) => itemIndex !== index))}>Remover</button>
        </div>)}<button type="button" className="supplier-add-line" onClick={() => setItems((current) => [...current, { productId: '', quantity: '1', unitPrice: '' }])}><Plus size={14} /> Adicionar produto</button><div className="purchase-order-total"><span>Total calculado com as quantidades e custos informados</span><strong>{money(total)}</strong></div></section>
        {error && <div className="supplier-form-error" role="alert">{error}</div>}
        <footer className="supplier-form-actions"><button type="button" className="supplier-secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-cta" disabled={saving}>{saving ? 'Salvando...' : 'Salvar rascunho'}</button></footer>
      </form>
    </section>
  </div>;
}

function ReceivePurchaseOrder({ order, onClose, onReceived }) {
  const [items, setItems] = useState(() => order.items.map((item) => {
    const remaining = Math.max(0, Number(item.quantity) - Number(item.receivedQuantity));
    return {
      itemId: item.id,
      title: item.product.title,
      remaining,
      unitCost: String(item.unitPrice),
      controlsExpiry: item.product.controlsExpiry === true || item.product.perishable === true,
      controlsLot: item.product.controlsLot === true,
      shelfLifeDays: Number.isSafeInteger(item.product.shelfLifeDays) ? item.product.shelfLifeDays : '',
      lots: [{
        quantity: String(remaining),
        lotCode: '',
        expiryMode: Number.isSafeInteger(item.product.shelfLifeDays) ? 'days' : 'date',
        shelfLifeDays: Number.isSafeInteger(item.product.shelfLifeDays) ? String(item.product.shelfLifeDays) : '',
        expiry: '',
        manufactureDate: '',
        location: '',
      }],
    };
  }));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const setItem = (index, field, value) => setItems((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, [field]: value } : item));
  const setLot = (itemIndex, lotIndex, field, value) => setItems((current) => current.map((item, index) => index === itemIndex
    ? { ...item, lots: item.lots.map((lot, indexInItem) => indexInItem === lotIndex ? { ...lot, [field]: value } : lot) }
    : item));
  const addLot = (itemIndex) => setItems((current) => current.map((item, index) => index === itemIndex
    ? { ...item, lots: [...item.lots, {
      quantity: '',
      lotCode: '',
      expiryMode: Number.isSafeInteger(item.shelfLifeDays) ? 'days' : 'date',
      shelfLifeDays: Number.isSafeInteger(item.shelfLifeDays) ? String(item.shelfLifeDays) : '',
      expiry: '',
      manufactureDate: '',
      location: '',
    }] }
    : item));
  const removeLot = (itemIndex, lotIndex) => setItems((current) => current.map((item, index) => index === itemIndex
    ? { ...item, lots: item.lots.filter((_, indexInItem) => indexInItem !== lotIndex) }
    : item));
  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      const response = await fetch('/api/erp/purchase-orders/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderId: order.id,
          items: items.map((item) => ({
            itemId: item.itemId,
            unitCost: item.unitCost,
            lots: item.lots,
          })),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o recebimento.');
      onReceived(data.order);
    } catch (receiveError) {
      setError(receiveError.message || 'Não foi possível registrar o recebimento.');
    } finally {
      setSaving(false);
    }
  };
  return <div className="supplier-drawer-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><section className="supplier-drawer purchase-order-drawer" role="dialog" aria-modal="true" aria-labelledby="receive-order-title">
    <header className="supplier-drawer-header"><div><span className="eyebrow">{order.code}</span><h2 id="receive-order-title">Conferir recebimento</h2><p>Divida cada quantidade entre os lotes. Informe a data do rótulo ou calcule pela fabricação e prazo em dias; o estoque só muda após confirmar.</p></div><button type="button" className="supplier-close-button" aria-label="Fechar recebimento" onClick={onClose}><X size={20} /></button></header>
    <form className="supplier-form" onSubmit={submit}><section className="supplier-form-section"><h3>{order.supplier.name}</h3>{items.map((item, index) => {
      const enteredMilliUnits = item.lots.reduce((sum, lot) => sum + Math.round((Number(decimalInput(lot.quantity)) || 0) * 1000), 0);
      const enteredQuantity = enteredMilliUnits / 1000;
      const remainingMilliUnits = Math.round(item.remaining * 1000);
      return <div className="purchase-order-receipt-item" key={item.itemId}>
        <div className="purchase-order-item-form receipt-order-item">
          <strong>{item.title}<small>Saldo a receber: {item.remaining} · informado: {enteredQuantity.toFixed(3).replace(/\.?0+$/, '')}</small></strong>
          <label>Custo real unitário (R$)<input type="number" min="0" step="0.01" value={item.unitCost} onChange={(event) => setItem(index, 'unitCost', event.target.value)} /></label>
        </div>
        <div className="purchase-lot-entry">
          <div className="purchase-lot-entry-header"><strong>Lotes recebidos</strong><button type="button" className="supplier-add-line" onClick={() => addLot(index)} disabled={saving || item.remaining === 0}><Plus size={14} /> Dividir em outro lote</button></div>
          {item.lots.map((lot, lotIndex) => {
            const usesDays = lot.expiryMode === 'days';
            const calculatedExpiry = expiryDateFromShelfLife(lot.manufactureDate, lot.shelfLifeDays);
            const lotHasQuantity = Number(lot.quantity) > 0;
            return <div className="purchase-receipt-lot-container" key={`${item.itemId}-${lotIndex}`}>
              <fieldset className="purchase-receipt-expiry-mode">
                <legend>Como informar a validade</legend>
                <label><input type="radio" name={`expiry-mode-${item.itemId}-${lotIndex}`} value="date" checked={!usesDays} onChange={() => setLot(index, lotIndex, 'expiryMode', 'date')} disabled={saving} /> Data do rótulo</label>
                <label><input type="radio" name={`expiry-mode-${item.itemId}-${lotIndex}`} value="days" checked={usesDays} onChange={() => setLot(index, lotIndex, 'expiryMode', 'days')} disabled={saving} /> Calcular por dias</label>
              </fieldset>
              <div className={`purchase-receipt-lot${usesDays ? ' uses-days' : ''}`}>
                <label>Quantidade<input type="number" min="0" max={item.remaining} step="0.001" value={lot.quantity} onChange={(event) => setLot(index, lotIndex, 'quantity', event.target.value)} required disabled={saving} /></label>
                <label>{item.controlsLot ? 'Código do lote *' : 'Código do lote'}<input value={lot.lotCode} onChange={(event) => setLot(index, lotIndex, 'lotCode', event.target.value)} placeholder="Opcional" required={item.controlsLot && lotHasQuantity} disabled={saving} /></label>
                <label>Fabricação{usesDays && lotHasQuantity ? ' *' : ''}<input type="date" value={lot.manufactureDate} onChange={(event) => setLot(index, lotIndex, 'manufactureDate', event.target.value)} required={usesDays && lotHasQuantity} disabled={saving} /></label>
                {usesDays && <label>Dias até vencer{lotHasQuantity ? ' *' : ''}<input type="number" min="1" max="36500" step="1" value={lot.shelfLifeDays} onChange={(event) => setLot(index, lotIndex, 'shelfLifeDays', event.target.value)} required={lotHasQuantity} disabled={saving} /></label>}
                <label>{item.controlsExpiry || usesDays ? 'Validade *' : 'Validade'}<input type="date" value={usesDays ? calculatedExpiry : lot.expiry} onChange={(event) => setLot(index, lotIndex, 'expiry', event.target.value)} required={(item.controlsExpiry || usesDays) && lotHasQuantity} disabled={saving || usesDays} /></label>
                <label>Localização<input value={lot.location} onChange={(event) => setLot(index, lotIndex, 'location', event.target.value)} placeholder="Padrão do produto" disabled={saving} /></label>
                <button type="button" className="purchase-receipt-lot-remove" aria-label={`Remover lote ${lotIndex + 1} de ${item.title}`} onClick={() => removeLot(index, lotIndex)} disabled={saving || item.lots.length === 1}><X size={16} /></button>
              </div>
            </div>;
          })}
          <p className={`purchase-lot-quantity ${enteredMilliUnits > remainingMilliUnits ? 'is-over' : ''}`} aria-live="polite">Total informado: <strong>{enteredQuantity.toFixed(3).replace(/\.?0+$/, '')}</strong> de {item.remaining}</p>
        </div>
      </div>;
    })}</section>
      {error && <div className="supplier-form-error" role="alert">{error}</div>}<footer className="supplier-form-actions"><button type="button" className="supplier-secondary-button" onClick={onClose}>Cancelar</button><button type="submit" className="primary-cta" disabled={saving}>{saving ? 'Registrando...' : 'Confirmar recebimento e atualizar estoque'}</button></footer>
    </form>
  </section></div>;
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveOrder, setReceiveOrder] = useState(null);
  const [deliveryDates, setDeliveryDates] = useState({});

  const loadData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [ordersResponse, suppliersResponse] = await Promise.all([
        fetch('/api/erp/purchase-orders', { cache: 'no-store' }),
        fetch('/api/erp/suppliers', { cache: 'no-store' }),
      ]);
      const [ordersData, suppliersData] = await Promise.all([ordersResponse.json(), suppliersResponse.json()]);
      if (!ordersResponse.ok || !suppliersResponse.ok) {
        throw new Error(ordersData.error || suppliersData.error || 'Não foi possível carregar os dados de compras.');
      }
      setOrders(ordersData.orders || []);
      setProducts(ordersData.products || []);
      setSuppliers(suppliersData.suppliers || []);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar ordens de compra.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { loadData(); }, [loadData]);
  useEffect(() => {
    const requestedStatus = new URLSearchParams(window.location.search).get('status');
    if (orderStatuses.includes(requestedStatus)) setStatusFilter(requestedStatus);
  }, []);

  const counts = useMemo(() => Object.fromEntries(orderStatuses.map((status) => [
    status,
    status === 'Todos' ? orders.length
      : status === 'Pendentes' ? orders.filter((order) => ['Aguardando Confirmação', 'Confirmado', 'Em Trânsito'].includes(order.status)).length
        : orders.filter((order) => order.displayStatus === status || status === order.status).length,
  ])), [orders]);
  const filteredOrders = useMemo(() => {
    const term = query.trim().toLocaleLowerCase('pt-BR');
    return orders.filter((order) => {
      const matchesTerm = !term || [order.code, order.supplier.name, order.supplier.taxId, ...order.items.map((item) => item.product.title)]
        .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(term));
      const matchesStatus = statusFilter === 'Todos'
        || (statusFilter === 'Pendentes' && ['Aguardando Confirmação', 'Confirmado', 'Em Trânsito'].includes(order.status))
        || order.displayStatus === statusFilter || order.status === statusFilter;
      return matchesTerm && matchesStatus;
    });
  }, [orders, query, statusFilter]);

  const updateOrder = async (order, patch) => {
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/purchase-orders', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: order.id, ...patch }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar o pedido.');
      setNotice(`Ordem ${order.code} atualizada. A ação foi registrada.`);
      await loadData();
    } catch (updateError) {
      setError(updateError.message || 'Não foi possível atualizar o pedido.');
    }
  };

  const cancelOrder = async (order) => {
    const reason = window.prompt(`Motivo do cancelamento da ordem ${order.code}:`);
    if (!reason?.trim()) return;
    await updateOrder(order, { status: 'Cancelado', reason });
  };

  const saveDeliveryDate = async (order) => {
    await updateOrder(order, { expectedDelivery: deliveryDates[order.id] ?? localDate(order.expectedDelivery) });
  };

  const onSaved = async (order) => {
    setCreateOpen(false);
    setNotice(`Rascunho ${order.code} criado com sucesso.`);
    await loadData();
  };
  const onReceived = async (order) => {
    setReceiveOrder(null);
    setNotice(`Recebimento de ${order.code} registrado. O estoque e o custo dos produtos foram atualizados.`);
    await loadData();
  };

  const transitionAction = (order) => {
    if (order.status === 'Rascunho') return <button type="button" onClick={() => updateOrder(order, { status: 'Aguardando Confirmação' })}>Enviar para confirmação</button>;
    if (order.status === 'Aguardando Confirmação') return <button type="button" onClick={() => updateOrder(order, { status: 'Confirmado' })}>Confirmar fornecedor</button>;
    if (order.status === 'Confirmado') return <button type="button" onClick={() => updateOrder(order, { status: 'Em Trânsito' })}>Marcar em trânsito</button>;
    return null;
  };

  return <div className="erp-module-page supplier-page purchase-orders-page">
    <header className="erp-customer-header supplier-page-header"><div><span className="eyebrow">Compras e abastecimento</span><h1>Ordens de compra</h1><p>Acompanhe pedidos reais, previsão de entrega e entrada conferida no estoque.</p></div><div className="supplier-header-actions"><Link href="/erp/suppliers" className="supplier-secondary-button"><ArrowLeft size={15} /> Fornecedores</Link><button type="button" className="primary-cta" onClick={() => setCreateOpen(true)} disabled={!suppliers.some((supplier) => supplier.status === 'Ativo') || !products.some((product) => product.status === 'Ativo')}><Plus size={15} /> Nova ordem</button></div></header>
    <nav className="supplier-subnav" aria-label="Módulos de abastecimento"><Link href="/erp/suppliers">Fornecedores</Link><span className="active">Ordens de compra</span></nav>
    <section className="supplier-order-help"><strong>Fluxo:</strong><span>Rascunho → Aguardando confirmação → Confirmado → Em trânsito → Recebido. Pedidos com previsão vencida são sinalizados como atraso. Recebimento parcial mantém a ordem pendente; cada entrada atualiza estoque e custo e registra auditoria.</span></section>
    {notice && <div className="supplier-notice" role="status"><Check size={16} /> {notice}<button type="button" aria-label="Fechar aviso" onClick={() => setNotice('')}><X size={15} /></button></div>}
    {error && <div className="supplier-error" role="alert">{error}<button type="button" onClick={loadData}>Tentar novamente</button></div>}
    <section className="supplier-table-panel">
      <div className="supplier-tools"><label className="supplier-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar ordem, fornecedor ou produto" aria-label="Buscar ordens de compra" /></label></div>
      <div className="supplier-status-tabs" role="tablist" aria-label="Filtrar ordens de compra">{orderStatuses.map((status) => <button key={status} type="button" role="tab" aria-selected={statusFilter === status} className={statusFilter === status ? 'active' : ''} onClick={() => setStatusFilter(status)}>{status} <span>{counts[status]}</span></button>)}</div>
      {loading && <div className="supplier-empty-state"><Truck size={25} /><strong>Carregando ordens de compra</strong><span>Consultando pedidos reais do banco de dados.</span></div>}
      {!loading && !error && !filteredOrders.length && <div className="supplier-empty-state"><CalendarClock size={27} /><strong>{orders.length ? 'Nenhuma ordem neste filtro' : 'Nenhuma ordem de compra registrada'}</strong><span>Pedidos de clientes não são considerados compras de fornecedores. Crie um rascunho com fornecedor ativo e itens reais do catálogo.</span>{!orders.length && <button type="button" className="primary-cta" disabled={!suppliers.some((supplier) => supplier.status === 'Ativo') || !products.some((product) => product.status === 'Ativo')} onClick={() => setCreateOpen(true)}><Plus size={15} /> Nova ordem de compra</button>}</div>}
      {!loading && !error && filteredOrders.length > 0 && <div className="purchase-order-list">{filteredOrders.map((order) => {
        const isTerminal = ['Recebido', 'Cancelado'].includes(order.status);
        const contactEmail = order.supplier.email;
        const contactPhone = (order.supplier.whatsapp || order.supplier.phone || '').replace(/\D/g, '');
        return <details className="purchase-order-record" key={order.id}>
          <summary><span className={`supplier-status-badge ${order.displayStatus === 'Em Atraso' ? 'inactive' : order.status === 'Recebido' ? 'active' : order.status === 'Rascunho' || order.status === 'Aguardando Confirmação' ? 'review' : ''}`}>{order.displayStatus}</span><span className="purchase-order-summary"><strong>{order.code} · {order.supplier.name}</strong><small>{order.items.length} produto(s) · {dateTime(order.orderedAt)}</small></span><span className="purchase-order-delivery">Entrega: {displayDate(order.expectedDelivery)}</span><strong className="purchase-order-amount">{money(order.total)}</strong></summary>
          <div className="purchase-order-record-body">
            <div className="purchase-order-meta"><span><strong>Criado por:</strong> {order.createdBy}</span><span><strong>Previsão:</strong> {displayDate(order.expectedDelivery)}</span>{order.receivedAt && <span><strong>Recebido em:</strong> {dateTime(order.receivedAt)}</span>}{order.notes && <p>{order.notes}</p>}</div>
            <div className="purchase-order-lines"><div className="purchase-order-line heading"><span>Produto</span><span>Solicitado</span><span>Recebido</span><span>Custo</span></div>{order.items.map((item) => <div className="purchase-order-line" key={item.id}><strong>{item.product.title}<small>{item.product.sku || item.product.externalId || item.product.id}</small></strong><span>{Number(item.quantity).toLocaleString('pt-BR')}{item.product.saleUnit === 'Quilograma' ? ' kg' : ' un.'}</span><span>{Number(item.receivedQuantity).toLocaleString('pt-BR')} / {Number(item.quantity).toLocaleString('pt-BR')}{item.product.saleUnit === 'Quilograma' ? ' kg' : ' un.'}</span><span>{money(item.receivedUnitCost ?? item.unitPrice)}{item.product.saleUnit === 'Quilograma' ? ' / kg' : ''}</span></div>)}</div>
            {!isTerminal && <div className="purchase-order-actions">
              {transitionAction(order)}
              {['Confirmado', 'Em Trânsito'].includes(order.status) && <button type="button" className="primary-cta" onClick={() => setReceiveOrder(order)}>Registrar recebimento</button>}
              <label>Previsão de entrega<input type="date" value={deliveryDates[order.id] ?? localDate(order.expectedDelivery)} onChange={(event) => setDeliveryDates((current) => ({ ...current, [order.id]: event.target.value }))} /></label>
              <button type="button" onClick={() => saveDeliveryDate(order)}>Salvar previsão</button>
              {contactEmail && <a href={`mailto:${contactEmail}?subject=${encodeURIComponent(`Acompanhamento da ordem ${order.code}`)}`}><Mail size={14} /> E-mail de acompanhamento</a>}
              {contactPhone && <a target="_blank" rel="noreferrer" href={`https://wa.me/${contactPhone}?text=${encodeURIComponent(`Olá, gostaria de confirmar o status da ordem ${order.code}.`)}`}><ExternalLink size={14} /> WhatsApp</a>}
              <button type="button" className="danger" onClick={() => cancelOrder(order)}>Cancelar pedido</button>
            </div>}
          </div>
        </details>;
      })}</div>}
      <footer className="supplier-table-footer">{loading ? ' ' : `${filteredOrders.length.toLocaleString('pt-BR')} ordem(ns) nesta lista · Rascunhos não entram no total de compras emitidas`}</footer>
    </section>
    {createOpen && <CreatePurchaseOrder suppliers={suppliers} products={products} onClose={() => setCreateOpen(false)} onSaved={onSaved} />}
    {receiveOrder && <ReceivePurchaseOrder order={receiveOrder} onClose={() => setReceiveOrder(null)} onReceived={onReceived} />}
  </div>;
}
