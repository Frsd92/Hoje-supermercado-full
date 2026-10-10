'use client';

import { Award, CalendarDays, CheckCircle2, ChevronRight, Mail, MapPin, Phone, PiggyBank, Printer, RefreshCw, Search, ShoppingBag, Star, TicketPercent, UserRound, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  canApproveOrderServiceRequest,
  orderServiceRequestStatus,
  orderServiceRequestStatusLabels,
  orderServiceRequestType,
  orderServiceRequestTypeLabels,
} from '@/features/orders/order-service-request-utils';

const initialCustomers = [];

function normalizeSearch(value) {
  return String(value || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

export default function ERPCustomersPage() {
  const [customers, setCustomers] = useState(initialCustomers);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('Todos');
  const [missionFilter, setMissionFilter] = useState('Todos');
  const [historyFilter, setHistoryFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [budgetDataAvailable, setBudgetDataAvailable] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [serviceRequestNotes, setServiceRequestNotes] = useState({});
  const [serviceRequestBusyId, setServiceRequestBusyId] = useState('');
  const [serviceRequestActionError, setServiceRequestActionError] = useState('');
  const [serviceRequestActionNotice, setServiceRequestActionNotice] = useState('');

  const loadCustomers = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await fetch('/api/erp/customers', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os clientes.');
      const savedCustomers = data.customers || [];
      setCustomers(savedCustomers);
      setSelected((current) => current
        ? savedCustomers.find((customer) => customer.email === current.email) || null
        : null);
      setBudgetDataAvailable(data.budgetDataAvailable !== false);
    } catch (error) {
      setLoadError(error.message || 'Não foi possível carregar os clientes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCustomers();
  }, [loadCustomers]);

  useEffect(() => {
    setServiceRequestActionError('');
    setServiceRequestActionNotice('');
  }, [selected?.id]);

  const filteredCustomers = useMemo(() => customers.filter((customer) => {
    const searchText = normalizeSearch([
      customer.name,
      customer.email,
      customer.id,
      customer.phone,
      customer.city,
      customer.status,
      ...(customer.tags || []),
    ].join(' '));
    return searchText.includes(normalizeSearch(query))
      && (statusFilter === 'Todos' || customer.status === statusFilter)
      && (missionFilter === 'Todos' || customer.nearMissionCount > 0);
  }), [customers, query, statusFilter, missionFilter]);

  const pendingServiceRequests = customers.flatMap((customer) => customer.serviceRequests || [])
    .filter((request) => request.status === orderServiceRequestStatus.requested);
  const metrics = [
    ['Clientes cadastrados', customers.length, UserRound],
    ['Clientes ativos', customers.filter((customer) => customer.status === 'Ativo').length, ShoppingBag],
    ['Missões a 75%+', customers.filter((customer) => customer.nearMissionCount > 0).length, Award],
    ['Sem comprar há 24h+', customers.filter((customer) => customer.daysWithoutPurchase >= 1).length, CalendarDays],
    ['LTV médio', 'Sem dados', Star],
    ['Pedidos de cancelamento', pendingServiceRequests.filter((request) => request.type === orderServiceRequestType.cancellation).length, RefreshCw],
    ['Pedidos de troca', pendingServiceRequests.filter((request) => request.type === orderServiceRequestType.exchange).length, RefreshCw],
  ];

  const toggleStatus = (customer) => {
    setCustomers((current) => current.map((item) => item.id === customer.id ? { ...item, status: item.status === 'Ativo' ? 'Inativo' : 'Ativo' } : item));
    setSelected((current) => current ? { ...current, status: current.status === 'Ativo' ? 'Inativo' : 'Ativo' } : current);
  };

  const updateServiceRequest = async (serviceRequest, action) => {
    setServiceRequestBusyId(serviceRequest.id);
    setServiceRequestActionError('');
    setServiceRequestActionNotice('');
    try {
      const response = await fetch(`/api/erp/service-requests/${encodeURIComponent(serviceRequest.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          note: serviceRequestNotes[serviceRequest.id] || '',
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar a solicitação.');
      setServiceRequestNotes((current) => ({ ...current, [serviceRequest.id]: '' }));
      setServiceRequestActionNotice(data.message || 'Solicitação atualizada.');
      void loadCustomers();
    } catch (error) {
      setServiceRequestActionError(error.message || 'Não foi possível atualizar a solicitação.');
    } finally {
      setServiceRequestBusyId('');
    }
  };

  const formatCurrency = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
  const formatRequestDate = (value) => {
    if (!value) return 'Data não informada';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  };
  const formatDate = (value) => {
    if (!value) return 'Data não informada';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Data não informada' : new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeZone: 'America/Sao_Paulo',
    }).format(date);
  };
  const selectedBudgetProgress = selected?.monthlyBudget > 0
    ? Math.min(100, (selected.currentMonthSpent / selected.monthlyBudget) * 100)
    : 0;
  const customerOrderHistory = selected?.orderHistory || [];
  const visibleOrderHistory = customerOrderHistory.filter((order) => {
    if (historyFilter === 'refunds') return order.refundedAmount > 0 || order.refunds.length > 0;
    if (historyFilter === 'cancellations') return order.status === 'Cancelado'
      || order.events.some((event) => event.type === 'cancellation');
    return true;
  });
  const confirmedRefundTotal = customerOrderHistory.reduce((total, order) => total + order.refundedAmount, 0);
  const netPurchaseTotal = customerOrderHistory.reduce((total, order) => total + order.netAmount, 0);
  const cancellationCount = customerOrderHistory.filter((order) => order.status === 'Cancelado').length;

  return (
    <div className="erp-customers-page">
      {loadError && <p className="erp-budget-warning" role="alert">{loadError}</p>}
      <div className="erp-customer-header"><div><span className="eyebrow">Relacionamento e dados</span><h1>Clientes</h1><p>Compras, missões, cupons e preferências em um só lugar.</p></div><button type="button" className="primary-cta">+ Novo cliente</button></div>
      <button type="button" className="editor-ghost" onClick={loadCustomers} disabled={loading}>
        {loading ? 'Atualizando clientes...' : 'Atualizar clientes e favoritos'}
      </button>
      <div className="erp-customer-metrics">{metrics.map(([label, value, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span></div>)}</div>
      <div className="erp-customer-toolbar"><div className="erp-customer-search"><Search size={16} /><input aria-label="Buscar clientes" placeholder="Buscar por nome, e-mail, telefone, cidade ou ID" value={query} onChange={(event) => setQuery(event.target.value)} />{query && <button type="button" aria-label="Limpar busca" onClick={() => setQuery('')}><X size={15} /></button>}</div><label className="erp-customer-filter">Status<select aria-label="Filtrar clientes por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option>Todos</option><option>Ativo</option><option>Inativo</option></select></label><label className="erp-customer-filter">Missões<select aria-label="Filtrar clientes por progresso de missão" value={missionFilter} onChange={(event) => setMissionFilter(event.target.value)}><option>Todos</option><option value="near">Perto de concluir (75%+)</option></select></label></div>
      <div className="erp-customer-layout"><section className="erp-customer-table-card"><div className="erp-table-heading"><div><h3>Base de clientes</h3><p>{loading ? 'Carregando dados reais...' : `${filteredCustomers.length} registros encontrados`}</p></div></div>{!budgetDataAvailable && <p className="erp-budget-warning" role="status">Os planos orçamentários estão indisponíveis porque não foi possível conectar ao banco de dados.</p>}{filteredCustomers.length ? <div className="erp-table-scroll"><table className="erp-table erp-customers-table"><thead><tr><th>Cliente</th><th>Status</th><th>Missões próximas</th><th>Última compra</th><th>Dias sem comprar</th><th>Pedidos</th><th>Total gasto</th><th>Plano orçamentário</th><th></th></tr></thead><tbody>{filteredCustomers.map((customer) => <tr key={customer.id} className={selected?.id === customer.id ? 'selected-row' : ''} onClick={() => setSelected(customer)}><td><strong>{customer.name}</strong><small>{customer.id} · {customer.email}</small></td><td><span className={`erp-status ${customer.status.toLowerCase()}`}>{customer.status}</span></td><td><span className={customer.nearMissionCount ? 'customer-mission-count is-near' : 'customer-mission-count'}>{customer.nearMissionCount || 0}</span></td><td>{customer.lastPurchase}</td><td><span className={customer.daysWithoutPurchase >= 30 ? 'customer-risk' : ''}>{customer.daysWithoutPurchase === null ? 'Sem dados' : `${customer.daysWithoutPurchase} dias`}</span></td><td>{customer.orders}</td><td>{formatCurrency(customer.spent)}</td><td>{!customer.budgetDataAvailable ? 'Indisponível' : customer.monthlyBudget ? formatCurrency(customer.monthlyBudget) : 'Não definido'}</td><td><ChevronRight size={15} /></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">{loading ? 'Carregando dados reais...' : 'Nenhum cliente encontrado com esses filtros.'}</div>}</section>
      {selected && <aside className="erp-customer-detail"><button type="button" className="detail-close" aria-label="Fechar detalhes do cliente" onClick={() => setSelected(null)}><X size={16} /></button><div className="customer-profile-heading"><div className="customer-avatar"><UserRound size={22} /></div><div><h2>{selected.name}</h2><span>{selected.id}</span></div></div><div className="customer-detail-actions"><button type="button" className="editor-ghost" onClick={() => toggleStatus(selected)}>{selected.status === 'Ativo' ? 'Desativar cliente' : 'Ativar cliente'}</button></div><div className="customer-contact-list"><span><Mail size={14} /> {selected.email}</span>{selected.phone && <span><Phone size={14} /> {selected.phone}</span>}{selected.city && <span><MapPin size={14} /> {selected.city}</span>}</div><div className="customer-detail-stats"><div><strong>{selected.orders}</strong><small>Pedidos</small></div><div><strong>{formatCurrency(selected.spent)}</strong><small>Total gasto</small></div><div><strong>{selected.favorites}</strong><small>Favoritos</small></div><div><strong>{selected.cartItems}</strong><small>No carrinho</small></div></div><section className="customer-detail-section customer-budget-section"><h3><PiggyBank size={16} /> Plano orçamentário</h3>{!selected.budgetDataAvailable ? <p>Dados do orçamento indisponíveis no momento.</p> : selected.monthlyBudget > 0 ? <><div className="customer-budget-values"><span>Limite mensal</span><strong>{formatCurrency(selected.monthlyBudget)}</strong></div><div className="customer-budget-values"><span>Gasto neste mês</span><strong>{formatCurrency(selected.currentMonthSpent)}</strong></div><div className="customer-budget-progress" role="progressbar" aria-label="Uso do orçamento mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(selectedBudgetProgress)}><span className={selectedBudgetProgress >= 80 ? 'near-limit' : ''} style={{ width: `${selectedBudgetProgress}%` }} /></div><small>{selectedBudgetProgress >= 100 ? `Orçamento excedido em ${formatCurrency(selected.currentMonthSpent - selected.monthlyBudget)}` : `${Math.round(selectedBudgetProgress)}% do orçamento mensal utilizado`}</small></> : <p>Este cliente ainda não definiu um orçamento mensal.</p>}</section>
        <section className="customer-detail-section customer-mission-section" aria-labelledby="customer-missions-title">
          <h3 id="customer-missions-title"><Award size={16} /> Missões em andamento ({selected.missionProgress?.length || 0})</h3>
          {selected.missionProgress?.length ? selected.missionProgress.map((mission) => {
            const isAmountMission = ['MINIMUM_SPEND', 'CATEGORY_SPEND'].includes(mission.ruleType);
            const current = isAmountMission ? formatCurrency(mission.current) : mission.current;
            const target = isAmountMission ? formatCurrency(mission.target) : mission.target;
            return <article className="customer-mission-progress" key={mission.id}>
              <div><strong>{mission.name}</strong>{mission.category && <small>{mission.category}</small>}</div>
              <span>{current} de {target}</span>
              <div className="customer-budget-progress" role="progressbar" aria-label={`Progresso da missão ${mission.name}`} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(mission.percent)}><span className={mission.nearCompletion ? 'near-limit' : ''} style={{ width: `${mission.percent}%` }} /></div>
              <small>{Math.round(mission.percent)}% concluída{mission.nearCompletion ? ' · perto de concluir' : ''}</small>
            </article>;
          }) : <p>Este cliente não tem progresso registrado em missões ativas.</p>}
        </section>
        <section className="customer-detail-section customer-coupon-section" aria-labelledby="customer-coupons-title">
          <h3 id="customer-coupons-title"><TicketPercent size={16} /> Cupons</h3>
          <div className="customer-coupon-counts">
            <span><strong>{selected.couponCounts?.available || 0}</strong> disponíveis</span>
            <span><strong>{selected.couponCounts?.expiredUnused || 0}</strong> expirados sem uso</span>
            <span><strong>{selected.couponCounts?.used || 0}</strong> usados</span>
            {(selected.couponCounts?.processing || 0) > 0 && <span><strong>{selected.couponCounts.processing}</strong> em processamento</span>}
          </div>
          {selected.coupons?.length ? <div className="customer-coupon-list">{selected.coupons.map((coupon) => (
            <article className="customer-coupon-card" key={coupon.code}>
              <div><strong>{coupon.code}</strong><span>{coupon.discountPercent}% de desconto</span></div>
              <span className={`customer-coupon-status ${coupon.status}`}>{({
                available: 'Disponível',
                expired: 'Expirado sem uso',
                used: 'Usado',
                processing: 'Em processamento',
              })[coupon.status]}</span>
              <small>Origem: {coupon.source === 'missões e pontos' ? 'Missões e pontos' : 'Área de cupons'}{coupon.sourceDetail ? ` · ${coupon.sourceDetail}` : ''}</small>
              <small>{coupon.status === 'used' || coupon.status === 'processing' ? `Usado em ${formatDate(coupon.usedAt)}` : `Validade: ${formatDate(coupon.expiresAt)}`}</small>
            </article>
          ))}</div> : <p>Nenhum cupom associado a este cliente.</p>}
        </section>
        <section className="customer-detail-section"><h3>Produtos favoritos ({selected.favoriteItems?.length || 0})</h3>{selected.favoriteItems?.length ? selected.favoriteItems.map((item) => <p key={item.name}><strong>{item.name}</strong> · {item.category || 'Sem categoria'}</p>) : <p>Nenhum favorito registrado.</p>}</section><section className="customer-detail-section"><h3>Itens no carrinho ({selected.cartItems})</h3>{selected.cartProducts?.length ? selected.cartProducts.map((item) => <p key={item.name}><strong>{item.name}</strong> · quantidade: {item.quantity || 1}</p>) : <p>Nenhum item no carrinho.</p>}</section><section className="customer-detail-section"><h3>Preferencias</h3>{selected.preferences?.length ? <div className="customer-tags">{selected.preferences.map((preference) => <span key={preference}>{preference}</span>)}</div> : <p>Nenhuma preferencia registrada.</p>}</section><section className="customer-detail-section"><h3>Comportamento</h3><p>Ultima compra: <strong>{selected.lastPurchase}</strong></p><p>Ticket medio: <strong>{selected.orders ? formatCurrency(selected.spent / selected.orders) : 'Sem dados'}</strong></p></section></aside>}
      </div>
      {selected && <section className="erp-customer-table-card erp-customer-history" aria-labelledby="customer-order-history-title">
        <div className="erp-table-heading customer-history-heading">
          <div>
            <span className="customer-history-eyebrow">Dossiê do cliente</span>
            <h3 id="customer-order-history-title">Histórico completo de compras, cancelamentos e estornos</h3>
            <p>{selected.name} · {selected.email} · {customerOrderHistory.length} pedido(s) no histórico</p>
          </div>
          <button type="button" className="customer-history-print" onClick={() => window.print()}>
            <Printer size={15} /> Imprimir histórico
          </button>
        </div>
        <div className="customer-history-summary" aria-label="Resumo financeiro do cliente">
          <div><span>Pedidos registrados</span><strong>{customerOrderHistory.length}</strong></div>
          <div><span>Cancelamentos</span><strong>{cancellationCount}</strong></div>
          <div><span>Valor devolvido</span><strong>{formatCurrency(confirmedRefundTotal)}</strong></div>
          <div><span>Pedidos após devoluções</span><strong>{formatCurrency(netPurchaseTotal)}</strong></div>
        </div>
        <div className="customer-history-filters" role="group" aria-label="Filtrar histórico do cliente">
          {[['all', 'Tudo'], ['refunds', 'Estornos'], ['cancellations', 'Cancelamentos']].map(([filter, label]) => (
            <button
              type="button"
              key={filter}
              className={historyFilter === filter ? 'active' : ''}
              aria-pressed={historyFilter === filter}
              onClick={() => setHistoryFilter(filter)}
            >
              {label}
            </button>
          ))}
        </div>
        {visibleOrderHistory.length ? <div className="customer-order-history-list">
          {visibleOrderHistory.map((order) => (
            <article className="customer-order-history-card" key={order.id}>
              <header className="customer-order-history-card-heading">
                <div>
                  <strong>Pedido {order.id}</strong>
                  <span>Realizado em {formatRequestDate(order.createdAt)}</span>
                </div>
                <div className="customer-order-history-badges">
                  <span className={`customer-history-status${order.status === 'Cancelado' ? ' cancelled' : ''}`}>{order.status}</span>
                  <span className={`customer-history-payment ${order.paymentStatus}`}>{({
                    paid: 'Pago',
                    partially_refunded: 'Estorno parcial',
                    refunded: 'Estornado',
                    pending: 'Aguardando pagamento',
                    failed: 'Pagamento não aprovado',
                    canceled: 'Pagamento cancelado',
                    manual: 'Pagamento manual / combinado',
                  })[order.paymentStatus] || order.paymentStatus}</span>
                </div>
              </header>
              <dl className="customer-order-financials">
                <div><dt>Total do pedido</dt><dd>{formatCurrency(order.total)}</dd></div>
                <div><dt>Devolvido</dt><dd>{formatCurrency(order.refundedAmount)}</dd></div>
                <div><dt>Após devoluções</dt><dd>{formatCurrency(order.netAmount)}</dd></div>
                <div><dt>Pagamento</dt><dd>{order.paymentMethod}</dd></div>
              </dl>
              {order.statusDateIsApproximate && <p className="customer-history-data-note">Não há um evento de cancelamento registrado para este pedido. A linha do tempo exibe a última atualização disponível, que não confirma a data exata do cancelamento.</p>}
              {order.refundedAmount > order.total && <p className="customer-history-data-note">O total devolvido registrado supera o valor do pedido. O histórico preserva os valores registrados; confira a conciliação financeira.</p>}
              <details className="customer-order-history-details">
                <summary>Ver itens e linha do tempo ({order.items.length} item(ns) · {order.events.length} evento(s))</summary>
                {order.items.length > 0 && <div className="customer-order-items">
                  <h4>Itens do pedido</h4>
                  {order.items.map((item) => <div className="customer-order-item" key={item.id}>
                    <span><strong>{item.name}</strong>{item.productCode && <small>Código {item.productCode}</small>}</span>
                    <span>{item.quantity} {item.unit} × {formatCurrency(item.unitPrice)}</span>
                    <strong>{formatCurrency(item.total)}</strong>
                  </div>)}
                </div>}
                {order.refunds.length > 0 && <div className="customer-refund-history">
                  <h4>Solicitações de estorno</h4>
                  {order.refunds.map((refund) => <article key={refund.id}>
                    <div><strong>{refund.code}</strong><span>{refund.statusLabel} · {formatCurrency(refund.amount)}</span></div>
                    <p><strong>Motivo:</strong> {refund.reason}</p>
                    <small>Solicitado por {refund.requestedBy || 'não informado'} em {formatRequestDate(refund.createdAt)}</small>
                    {refund.reviewedAt && <small>Analisado por {refund.reviewedBy || 'não informado'} em {formatRequestDate(refund.reviewedAt)}</small>}
                    {refund.decisionNote && <small>Decisão: {refund.decisionNote}</small>}
                  </article>)}
                </div>}
                <ol className="customer-order-event-list">
                  {order.events.map((event) => <li className={`customer-order-event ${event.type}`} key={event.id}>
                    <span className="customer-order-event-marker" aria-hidden="true" />
                    <div>
                      <strong>{event.label}</strong>
                      <small>{formatRequestDate(event.createdAt)}{event.actor ? ` · ${event.actor}` : ''}{event.amount ? ` · ${formatCurrency(event.amount)}` : ''}</small>
                      {event.note && <p>{event.note}</p>}
                    </div>
                  </li>)}
                </ol>
                <p className="customer-history-data-note">O histórico apresenta os eventos registrados no sistema. Alterações de status sem trilha própria aparecem somente como estado atual ou última atualização; valores devolvidos consideram o acumulado confirmado no pedido. O valor após devoluções é uma subtração do total do pedido e não substitui a conciliação do pagamento.</p>
              </details>
            </article>
          ))}
        </div> : <div className="erp-empty-data">Não há pedidos que correspondam a este filtro para o cliente.</div>}
        <footer className="customer-history-report-footer">
          Extrato gerado em {formatRequestDate(new Date())}. Valores de devolução refletem o total confirmado atualmente registrado em cada pedido.
        </footer>
      </section>}
      {selected && <section className="erp-customer-table-card erp-customer-service-requests" aria-labelledby="customer-service-requests-title">
        <div className="erp-table-heading">
          <div>
            <h3 id="customer-service-requests-title">Pedidos de cancelamento e troca</h3>
            <p>{selected.serviceRequests?.length || 0} solicitação(ões) vinculada(s) a {selected.name}</p>
          </div>
        </div>
        {serviceRequestActionError && <p className="erp-budget-warning" role="alert">{serviceRequestActionError}</p>}
        {serviceRequestActionNotice && <p className="customer-service-request-notice" role="status">{serviceRequestActionNotice}</p>}
        {selected.serviceRequests?.length ? <div className="customer-service-request-list">
          {selected.serviceRequests.map((request) => {
            const canApprove = canApproveOrderServiceRequest(request);
            const note = serviceRequestNotes[request.id] || '';
            return <article className="customer-service-request-card" key={request.id}>
              <div className="customer-service-request-heading">
                <div>
                  <strong>{orderServiceRequestTypeLabels[request.type] || request.type} · {request.code}</strong>
                  <span>Pedido {request.orderId} · {formatRequestDate(request.createdAtIso || request.createdAt)}</span>
                </div>
                <span className={`customer-service-request-status ${request.status}`}>{orderServiceRequestStatusLabels[request.status] || request.status}</span>
              </div>
              {request.orderItemName && <p><strong>Item solicitado:</strong> {request.orderItemName}</p>}
              {request.replacementProduct && <p><strong>Produto desejado:</strong> {request.replacementProduct}</p>}
              <p><strong>Motivo:</strong> {request.reason}</p>
              {request.decisionNote && <p><strong>Decisão:</strong> {request.decisionNote}</p>}
              {request.status === orderServiceRequestStatus.requested && <div className="customer-service-request-actions">
                {request.type === orderServiceRequestType.cancellation && !canApprove && <p role="note">O pedido já está em trânsito ou concluído; este cancelamento não pode ser aprovado.</p>}
                <label htmlFor={`service-request-note-${request.id}`}>Observação do atendimento (mínimo 8 caracteres)</label>
                <textarea
                  id={`service-request-note-${request.id}`}
                  maxLength={500}
                  value={note}
                  onChange={(event) => setServiceRequestNotes((current) => ({ ...current, [request.id]: event.target.value }))}
                />
                <div>
                  <button type="button" disabled={serviceRequestBusyId === request.id || note.trim().length < 8 || !canApprove} onClick={() => updateServiceRequest(request, 'approve')}>
                    <CheckCircle2 size={14} />{request.type === orderServiceRequestType.cancellation ? 'Aprovar cancelamento' : 'Aprovar troca'}
                  </button>
                  <button type="button" disabled={serviceRequestBusyId === request.id || note.trim().length < 8} onClick={() => updateServiceRequest(request, 'reject')}>Recusar</button>
                </div>
              </div>}
            </article>;
          })}
        </div> : <div className="erp-empty-data">Este cliente ainda não solicitou cancelamento ou troca.</div>}
      </section>}
    </div>
  );
}
