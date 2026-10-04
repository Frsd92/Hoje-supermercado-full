'use client';

import Link from 'next/link';
import { Activity, BarChart3, CircleDollarSign, Clock3, FileText, MapPin, MessageSquareText, PackageCheck, ShoppingBag, Tag, TicketPercent, Trash2, Users, Zap } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatCartQuantity } from '@/app/dashboard/cart-utils';
import { storeErpRecipientHandoff } from '@/features/erp/customer-recipient-handoff';

const money = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const percent = (value) => `${Number(value || 0).toFixed(1).replace('.', ',')}%`;

function Bars({ items }) {
  const max = Math.max(...items.map((item) => Number(item.value) || 0), 1);
  if (!items.length) return <div className="erp-empty-data">Ainda não há vendas suficientes.</div>;
  return <div className="analytics-bars">{items.map((item) => <div className="analytics-bar-column" key={item.label}><span>{money(item.value)}</span><div className="analytics-bar-track"><i style={{ height: `${Math.max((item.value / max) * 100, 4)}%` }} /></div><small>{item.label}</small></div>)}</div>;
}

function Ranking({ items, unit = 'unidades', moneyValues = false }) {
  const amountOf = (item) => Number(item.value ?? item.quantity) || 0;
  const max = Math.max(...items.map(amountOf), 1);
  if (!items.length) return <div className="erp-empty-data">Ainda não há dados suficientes.</div>;
  return <div className="analytics-category-list">{items.map((item) => { const amount = amountOf(item); const unitLabel = item.unit || unit; return <div key={item.label || item.title}><div><strong>{item.label || item.title}</strong><span>{moneyValues ? money(amount) : `${amount.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${unitLabel}`}</span></div><div className="analytics-progress"><i style={{ width: `${Math.max((amount / max) * 100, 4)}%` }} /></div></div>; })}</div>;
}

function PeriodCard({ label, summary, comparison }) {
  const change = comparison?.revenue ? ((summary.revenue - comparison.revenue) / comparison.revenue) * 100 : null;
  return <div className="analytics-period-card"><span>{label}</span><strong>{money(summary.revenue)}</strong><small>{summary.orders} pedido(s) · ticket {money(summary.averageTicket)}</small>{change === null ? <em>Sem período anterior</em> : <em className={change >= 0 ? 'positive' : 'negative'}>{change >= 0 ? '+' : ''}{percent(change)} vs. anterior</em>}</div>;
}

function GeographyRanking({ title, items }) {
  return <section className="analytics-panel"><div className="erp-panel-title"><MapPin size={17} /><div><h3>{title}</h3><p>Regiões com mais pedidos, em todo o histórico.</p></div></div>{items.length ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Localidade</th><th>Pedidos</th><th>Faturamento</th></tr></thead><tbody>{items.map((item) => <tr key={item.label}><td><strong>{item.label}</strong></td><td>{item.orders}</td><td><strong>{money(item.revenue)}</strong></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">Ainda não há pedidos com essa localização identificada.</div>}</section>;
}

function AbandonedCartActions({ cart, onCartCleared }) {
  const [confirming, setConfirming] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [actionError, setActionError] = useState('');

  const prepareRecipientHandoff = (event, destination) => {
    setActionError('');
    try {
      storeErpRecipientHandoff(cart.email, destination);
    } catch (error) {
      event.preventDefault();
      console.error('Não foi possível preparar o destinatário do carrinho abandonado:', error);
      setActionError('Não foi possível preparar o destinatário. Tente novamente.');
    }
  };

  const clearCart = async () => {
    setClearing(true);
    setActionError('');
    try {
      const response = await fetch('/api/erp/abandoned-carts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cartType: cart.type,
          email: cart.email,
          cartRef: cart.cartRef,
          updatedAt: cart.updatedAt,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível zerar o carrinho.');
      setConfirming(false);
      onCartCleared(cart.name);
    } catch (error) {
      setActionError(error.message || 'Não foi possível zerar o carrinho.');
    } finally {
      setClearing(false);
    }
  };

  const isCustomer = cart.type === 'customer' && Boolean(cart.email);
  const isGuest = cart.type === 'guest' && Boolean(cart.cartRef);
  if (!isCustomer && !isGuest) return <span className="analytics-cart-guest-note">Não foi possível preparar ações para este carrinho.</span>;

  return <div className="analytics-cart-actions">
    {isGuest && <span className="analytics-cart-guest-note">Visitante sem cadastro: é possível zerar o carrinho, mas não enviar comunicado ou cupom direcionado.</span>}
    <div className="analytics-cart-action-list">
      {isCustomer && <>
        <Link className="analytics-cart-action" href="/erp/communications" onClick={(event) => prepareRecipientHandoff(event, 'communications')} aria-label={`Criar comunicado para ${cart.name}`}>
          <MessageSquareText size={14} />Comunicado
        </Link>
        <Link className="analytics-cart-action" href="/erp/promotions" onClick={(event) => prepareRecipientHandoff(event, 'promotions')} aria-label={`Criar cupom para ${cart.name}`}>
          <TicketPercent size={14} />Cupom
        </Link>
      </>}
      {!confirming && <button className="analytics-cart-action danger" type="button" onClick={() => { setActionError(''); setConfirming(true); }} aria-label={`Zerar carrinho de ${cart.name}`}>
        <Trash2 size={14} />Zerar carrinho
      </button>}
    </div>
    {confirming && <div className="analytics-cart-confirmation" role="group" aria-label={`Confirmar limpeza do carrinho de ${cart.name}`}>
      <span>Remover os itens salvos deste carrinho?</span>
      <button className="analytics-cart-action danger" type="button" onClick={clearCart} disabled={clearing}>{clearing ? 'Zerando...' : 'Confirmar'}</button>
      <button className="analytics-cart-action" type="button" onClick={() => setConfirming(false)} disabled={clearing}>Cancelar</button>
    </div>}
    {actionError && <small className="analytics-cart-action-error" role="alert">{actionError}</small>}
  </div>;
}

function DemographicInsights({ insights }) {
  const panels = [
    ['Consumo por sexo', insights.gender, 'Ainda não há dados de sexo informados por clientes com compras.'],
    ['Consumo por faixa etária', insights.ageGroups, 'Ainda não há datas de nascimento informadas por clientes com compras.'],
  ];

  return <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Perfil de compra</span><h2>Consumo por sexo e idade</h2></div>
      <span>Dados opcionais, informados pelos próprios clientes e apresentados de forma agregada</span>
    </div>
    {!insights.available
      ? <div className="erp-budget-warning" role="status">Não foi possível conectar ao banco para carregar essas estatísticas.</div>
      : <>
        <div className="analytics-grid">{panels.map(([title, groups, emptyMessage]) => <section className="analytics-panel" key={title}>
          <h3>{title}</h3>
          {groups.length
            ? <div className="analytics-category-list">{groups.map((group) => <div key={group.label}><div><strong>{group.label}</strong><span>{group.orders} compra(s) · {group.customers} cliente(s) · {money(group.revenue)}</span></div></div>)}</div>
            : <div className="erp-empty-data">{emptyMessage}</div>}
        </section>)}</div>
        <p className="analytics-source-note">{insights.customersWithGender} de {insights.customersWithOrders} clientes compradores informaram sexo; {insights.customersWithBirthDate} informaram a data de nascimento. Os dados são apresentados apenas de forma agregada.</p>
      </>}
  </section>;
}

function InvoiceCpfInsights({ insights }) {
  const genderGroups = insights.gender || [];
  const requesters = insights.requesters || [];
  const informedGroups = genderGroups.filter((group) => group.label !== 'Não informado');
  const leadingGroup = [...informedGroups].sort((first, second) => second.customers - first.customers)[0];

  return <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Notas fiscais</span><h2>Clientes que pedem CPF na nota</h2></div>
      <span>Histórico de pedidos ativos com consentimento explícito.</span>
    </div>
    <div className="erp-customer-metrics">
      <div className="erp-customer-metric"><FileText size={17} /><strong>{insights.totalOrders || 0}</strong><span>Pedidos com CPF na nota</span></div>
      <div className="erp-customer-metric"><Users size={17} /><strong>{insights.totalCustomers || 0}</strong><span>Clientes solicitantes</span></div>
      <div className="erp-customer-metric"><Users size={17} /><strong>{leadingGroup?.label || 'Sem dados'}</strong><span>Mais clientes solicitantes</span><small>{leadingGroup ? `${leadingGroup.customers} cliente(s)` : 'Gênero não informado'}</small></div>
    </div>
    {!insights.demographicsAvailable && <div className="erp-budget-warning" role="status">Não foi possível carregar os gêneros do perfil; os pedidos e clientes solicitantes continuam contabilizados.</div>}
    <div className="analytics-grid">
      <section className="analytics-panel">
        <h3>Solicitações por gênero do perfil</h3>
        {genderGroups.length
          ? <div className="analytics-category-list">{genderGroups.map((group) => <div key={group.label}><div><strong>{group.label}</strong><span>{group.customers} cliente(s) · {group.orders} pedido(s)</span></div></div>)}</div>
          : <div className="erp-empty-data">Ainda não há pedidos com CPF na nota.</div>}
        <p className="analytics-source-note">A comparação de gênero conta clientes únicos e também mostra o total de pedidos. Perfis sem gênero informado ficam separados.</p>
      </section>
      <section className="analytics-panel">
        <div className="erp-panel-title"><Users size={17} /><div><h3>Quem solicitou</h3><p>Clientes com ao menos um pedido ativo que inclui CPF na nota.</p></div></div>
        {requesters.length
          ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Cliente</th><th>Gênero</th><th>Pedidos</th></tr></thead><tbody>{requesters.map((customer) => <tr key={customer.key}><td><strong>{customer.name}</strong><small>{customer.email || 'E-mail não informado'}</small></td><td>{customer.gender}</td><td>{customer.requests}</td></tr>)}</tbody></table></div>
          : <div className="erp-empty-data">Nenhum cliente solicitou CPF na nota até agora.</div>}
      </section>
    </div>
  </section>;
}

function ProfitabilityInsights({ profitability }) {
  return <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Lucratividade</span><h2>Resultado e margem</h2></div>
      <span>{profitability.available ? 'Custos registrados por item vendido' : 'Não exibe estimativas sem custo confiável'}</span>
    </div>
    {!profitability.available
      ? <div className="erp-budget-warning" role="status">
        {profitability.totalItems
          ? `Lucro e margem indisponíveis: ${profitability.missingCostItems} item(ns) vendido(s) não têm custo registrado no momento da venda.`
          : 'Ainda não há pedidos com itens suficientes para calcular lucro e margem.'}
      </div>
      : <>
        <div className="erp-customer-metrics">
          <div className="erp-customer-metric"><CircleDollarSign size={17} /><strong>{money(profitability.grossProfit)}</strong><span>Lucro bruto</span><small>Receita líquida menos CMV</small></div>
          <div className="erp-customer-metric"><Activity size={17} /><strong>{profitability.margin === null ? 'Sem dados' : percent(profitability.margin)}</strong><span>Margem bruta</span><small>Sobre as vendas registradas</small></div>
          <div className="erp-customer-metric"><ShoppingBag size={17} /><strong>{money(profitability.cmv)}</strong><span>CMV</span><small>Custo dos itens vendidos</small></div>
        </div>
        <div className="analytics-grid">
          <section className="analytics-panel"><h3>Lucro por categoria</h3><Ranking items={profitability.categories} moneyValues /></section>
          <section className="analytics-panel"><h3>Lucro por marca</h3><Ranking items={profitability.brands} moneyValues /></section>
        </div>
      </>}
  </section>;
}

function InventoryInsights({ inventory }) {
  const riskRows = [
    ...inventory.expiredLots.map((lot) => ({ ...lot, state: 'Vencido', key: `expired-${lot.id}` })),
    ...inventory.nearExpiryLots.map((lot) => ({ ...lot, state: 'Vence em até 30 dias', key: `expiry-${lot.id}` })),
    ...inventory.lowStock.map((product) => ({ ...product, product: product.title, lotCode: '—', state: 'Estoque baixo', key: `low-${product.id}` })),
    ...inventory.outOfStock.map((product) => ({ ...product, product: product.title, lotCode: '—', state: 'Sem estoque', key: `empty-${product.id}` })),
  ].slice(0, 40);

  return <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Estoque</span><h2>Risco e capital parado</h2></div>
      <span>{inventory.stockValueComplete ? `Custo em estoque: ${money(inventory.stockValue)}` : `Custo conhecido: ${money(inventory.stockValue)}`}</span>
    </div>
    {!inventory.stockValueComplete && <div className="erp-budget-warning" role="status">
      O valor é parcial: {inventory.uncostedStockProducts} produto(s) com saldo não têm custo cadastrado.
    </div>}
    {inventory.unconfiguredMinimumStock > 0 && <p className="analytics-source-note">
      Limite mínimo não configurado em {inventory.unconfiguredMinimumStock} produto(s); esses itens não entram no alerta de estoque mínimo.
    </p>}
    <div className="erp-customer-metrics">
      <div className="erp-customer-metric"><strong>{inventory.outOfStock.length}</strong><span>Rupturas</span><small>Produtos sem saldo</small></div>
      <div className="erp-customer-metric"><strong>{inventory.lowStock.length}</strong><span>Estoque mínimo</span><small>Com limite cadastrado</small></div>
      <div className="erp-customer-metric"><strong>{inventory.nearExpiry.length}</strong><span>Validade próxima</span><small>Produtos com lote em até 30 dias</small></div>
      <div className="erp-customer-metric"><strong>{inventory.expiredLots.length}</strong><span>Lotes vencidos</span><small>Com quantidade disponível</small></div>
    </div>
    <div className="analytics-panel">
      <div className="erp-panel-title"><PackageCheck size={17} /><div><h3>Produtos e lotes que precisam de atenção</h3><p>Saldo e validade consultados no cadastro de lotes do ERP.</p></div></div>
      {riskRows.length
        ? <div className="erp-table-scroll"><table className="erp-table">
          <thead><tr><th>Produto</th><th>Lote</th><th>Saldo</th><th>Validade</th><th>Alerta</th></tr></thead>
          <tbody>{riskRows.map((row) => <tr key={row.key}>
            <td><strong>{row.product || row.title}</strong><small>{row.category || 'Sem categoria'}</small></td>
            <td>{row.lotCode || '—'}</td>
            <td>{Number(row.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td>
            <td>{row.date || row.expiry ? new Date(row.date || row.expiry).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }) : '—'}</td>
            <td>{row.state}</td>
          </tr>)}</tbody>
        </table></div>
        : <div className="erp-empty-data">Nenhum risco de estoque identificado com os dados atuais.</div>}
    </div>
    <p className="analytics-source-note">
      {inventory.productsWithLots} de {inventory.catalogProducts} produtos têm lotes registrados ({inventory.coveragePercent === null ? 'sem catálogo' : percent(inventory.coveragePercent)}).
    </p>
  </section>;
}

function AddressInsights({ insights }) {
  return <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Entrega e cobertura</span><h2>Endereços dos clientes</h2></div>
      <span>Localidades agregadas; rua e CEP não são exibidos</span>
    </div>
    <div className="erp-customer-metrics">
      <div className="erp-customer-metric"><Users size={17} /><strong>{insights.profiles}</strong><span>Perfis cadastrados</span></div>
      <div className="erp-customer-metric"><MapPin size={17} /><strong>{insights.totalAddresses}</strong><span>Endereços salvos</span></div>
      <div className="erp-customer-metric"><Users size={17} /><strong>{insights.customersWithAddress}</strong><span>Clientes com endereço</span></div>
      <div className="erp-customer-metric"><Activity size={17} /><strong>{insights.coveragePercent === null ? '—' : percent(insights.coveragePercent)}</strong><span>Cobertura dos perfis</span></div>
    </div>
    <div className="analytics-grid">
      <section className="analytics-panel"><h3>Estados dos endereços</h3><Ranking items={insights.states} unit="endereços" /></section>
      <section className="analytics-panel"><h3>Cidades e municípios</h3><Ranking items={insights.municipalities} unit="endereços" /></section>
    </div>
  </section>;
}

function PromotionInsights({ promotions }) {
  const stateLabels = { active: 'Ativa', scheduled: 'Agendada', expired: 'Encerrada', invalid: 'Revisar' };

  return <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Desempenho comercial</span><h2>Promoções e ofertas</h2></div>
      <span>Vendas e resgates ligados a registros persistidos</span>
    </div>
    <div className="erp-customer-metrics">
      <div className="erp-customer-metric"><Zap size={17} /><strong>{promotions.summary.activeFlashOffers}</strong><span>Ofertas relâmpago ativas</span></div>
      <div className="erp-customer-metric"><Clock3 size={17} /><strong>{promotions.summary.scheduledFlashOffers}</strong><span>Ofertas agendadas</span></div>
      <div className="erp-customer-metric"><Tag size={17} /><strong>{promotions.summary.couponCampaigns}</strong><span>Campanhas de cupom</span></div>
      <div className="erp-customer-metric"><ShoppingBag size={17} /><strong>{promotions.summary.redeemedCoupons}</strong><span>Cupons resgatados</span></div>
    </div>
    <div className="analytics-grid">
      <section className="analytics-panel">
        <div className="erp-panel-title"><Zap size={17} /><div><h3>Ofertas relâmpago</h3><p>Vendas associadas quando a oferta estava ativa no checkout.</p></div></div>
        {promotions.flashOffers.length
          ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Produto</th><th>Status</th><th>Preço</th><th>Pedidos</th><th>Unidades</th><th>Faturamento</th></tr></thead><tbody>
            {promotions.flashOffers.map((offer) => <tr key={offer.id}>
              <td><strong>{offer.title}</strong><small>Desconto registrado: {money(offer.discount)}</small></td>
              <td>{stateLabels[offer.state] || 'Desativada'}</td>
              <td>{money(offer.price)}</td>
              <td>{offer.orders}</td>
              <td>{Number(offer.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}</td>
              <td>{money(offer.revenue)}</td>
            </tr>)}
          </tbody></table></div>
          : <div className="erp-empty-data">Nenhuma oferta relâmpago cadastrada.</div>}
      </section>
      <section className="analytics-panel">
        <div className="erp-panel-title"><Tag size={17} /><div><h3>Campanhas de cupom</h3><p>Resgates, pedidos vinculados e desconto concedido.</p></div></div>
        {promotions.coupons.length
          ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Código</th><th>Status</th><th>Desconto</th><th>Resgates</th><th>Pedidos</th><th>Desconto concedido</th></tr></thead><tbody>
            {promotions.coupons.map((coupon) => <tr key={coupon.id}>
              <td><strong>{coupon.code}</strong><small>{coupon.recipients} destinatário(s)</small></td>
              <td>{coupon.expired ? 'Expirada' : 'Ativa'}</td>
              <td>{coupon.discountPercent}%</td>
              <td>{coupon.redemptions}</td>
              <td>{coupon.orders}</td>
              <td>{money(coupon.discount)}</td>
            </tr>)}
          </tbody></table></div>
          : <div className="erp-empty-data">Nenhuma campanha de cupom cadastrada.</div>}
      </section>
    </div>
    <p className="analytics-source-note">
      Promoções anteriores ao registro de pedidos no banco não podem ser reconstruídas; não são estimadas.
    </p>
  </section>;
}

export default function AnalyticsPage() {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('overview');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [cartActionFeedback, setCartActionFeedback] = useState('');
  const tabRefs = useRef([]);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const params = new URLSearchParams();
        if (startDate) params.set('startDate', startDate);
        if (endDate) params.set('endDate', endDate);
        const query = params.toString() ? `?${params.toString()}` : '';
        const response = await fetch(`/api/erp/analytics${query}`, { cache: 'no-store' });
        const nextData = await response.json();
        if (!response.ok) throw new Error(nextData.error || 'Não foi possível carregar os indicadores.');
        if (!nextData?.sales?.paymentCoverage || !nextData?.profitability || !nextData?.inventory || !nextData?.customers || !nextData?.dataSources || !nextData?.addressInsights || !nextData?.promotions || !Array.isArray(nextData?.abandonedCarts?.carts) || !Array.isArray(nextData?.abandonedCarts?.customers) || !Array.isArray(nextData?.abandonedCarts?.topProducts) || typeof nextData?.abandonedCarts?.guestCarts !== 'number') {
          throw new Error('A resposta do Analytics está incompleta.');
        }
        if (active) {
          setData(nextData);
          setError('');
        }
      } catch (loadError) {
        if (active) setError(loadError.message || 'Não foi possível atualizar os indicadores.');
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    const timer = window.setInterval(load, 10000);
    return () => { active = false; window.clearInterval(timer); };
  }, [startDate, endDate, reloadToken]);

  const sales = data?.sales || { daily: [], hourly: [], weekdays: [] };
  const profitability = data?.profitability || { grossProfit: 0, cmv: 0, margin: 0, products: [], categories: [], brands: [] };
  const inventory = data?.inventory || { stockValue: 0, outOfStock: [], lowStock: [], nearExpiry: [] };
  const customers = data?.customers || { total: 0, newCustomers: 0, recurringCustomers: 0, purchaseFrequency: 0, averageTicket: 0, totalSpent: 0, spending: [], topProducts: [], pairs: [] };
  const customerInsights = data?.customerInsights || { available: true, gender: [], ageGroups: [], customersWithGender: 0, customersWithBirthDate: 0, customersWithOrders: 0 };
  const invoiceCpf = data?.invoiceCpf || { totalOrders: 0, totalCustomers: 0, gender: [], requesters: [], demographicsAvailable: true };
  const abandonedCarts = data?.abandonedCarts || { available: true, idleThresholdHours: 24, total: 0, customers: [], carts: [], guestCarts: 0, cartsWithoutActivityDate: 0, topProducts: [] };
  const geography = data?.geography || { totalOrders: 0, unlocatedOrders: 0, states: [], municipalities: [], neighborhoods: [] };
  const periods = sales.periods || { today: { revenue: 0, orders: 0, averageTicket: 0 }, week: { revenue: 0, orders: 0, averageTicket: 0 }, month: { revenue: 0, orders: 0, averageTicket: 0 }, previousWeek: { revenue: 0 }, previousMonth: { revenue: 0 } };
  const tabs = [['overview', 'Visão geral'], ['sales', 'Vendas'], ['profitability', 'Lucratividade'], ['inventory', 'Estoque'], ['customers', 'Clientes'], ['demographics', 'Sexo e idade'], ['invoiceCpf', 'CPF na nota'], ['promotions', 'Promoções']];
  const metrics = [
    ['Receita', money(sales.revenue), `${sales.orders || 0} pedidos`, CircleDollarSign],
    ['Lucro bruto', profitability.available ? money(profitability.grossProfit) : 'Sem dados', profitability.available ? `CMV ${money(profitability.cmv)}` : 'Custo por item incompleto', Activity],
    ['Margem', profitability.margin === null ? 'Sem dados' : percent(profitability.margin), 'Sobre vendas registradas', BarChart3],
    ['Ticket médio', money(sales.averageTicket), 'Por pedido', ShoppingBag],
  ];
  const handleTabKeyDown = (event, index) => {
    const keyToOffset = { ArrowRight: 1, ArrowLeft: -1, Home: -index, End: tabs.length - 1 - index };
    if (!(event.key in keyToOffset)) return;
    event.preventDefault();
    const nextIndex = (index + keyToOffset[event.key] + tabs.length) % tabs.length;
    setTab(tabs[nextIndex][0]);
    tabRefs.current[nextIndex]?.focus();
  };

  return <div className="erp-module-page analytics-page">
    <div className="erp-customer-header"><div><span className="eyebrow">Inteligência operacional</span><h1>Analytics</h1><p>Indicadores calculados dos pedidos, catálogo, estoque e clientes reais.</p></div><div className="analytics-header-tools">{tab === 'sales' && <><label className="analytics-date-filter">De<input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="analytics-date-filter">Até<input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} /></label><button type="button" className="analytics-clear-filter" onClick={() => { setStartDate(''); setEndDate(''); }}>Limpar</button></>}<span className="analytics-live"><span /> Atualiza a cada 10 segundos</span></div></div>
    <div className="analytics-tabs" role="tablist" aria-label="Seções do Analytics">{tabs.map(([value, label], index) => <button
      type="button"
      role="tab"
      id={`analytics-tab-${value}`}
      aria-controls="analytics-tabpanel"
      aria-selected={tab === value}
      tabIndex={tab === value ? 0 : -1}
      className={tab === value ? 'active' : ''}
      onClick={() => setTab(value)}
      onKeyDown={(event) => handleTabKeyDown(event, index)}
      ref={(element) => { tabRefs.current[index] = element; }}
      key={value}
    >{label}</button>)}</div>
    {error && data && <div className="erp-budget-warning analytics-refresh-warning" role="status">
      Não foi possível atualizar os indicadores: {error}
      <button type="button" onClick={() => setReloadToken((current) => current + 1)}>Tentar novamente</button>
    </div>}
    {!data && loading ? <div className="erp-empty-data" role="status">Carregando indicadores reais...</div> : !data
      ? <div className="erp-budget-warning" role="alert">{error || 'Não foi possível carregar os indicadores.'}<button type="button" onClick={() => setReloadToken((current) => current + 1)}>Tentar novamente</button></div>
      : <div id="analytics-tabpanel" role="tabpanel" aria-labelledby={`analytics-tab-${tab}`} tabIndex={0}>
    {!data.dataSources.hasOrderHistory && <div className="erp-empty-data analytics-history-empty" role="status">
      O banco ainda não tem pedidos registrados. As vendas passarão a aparecer após o próximo pedido ser registrado.
    </div>}
    {tab === 'sales' && sales.paymentCoverage.totalOrders > 0 && <p className="analytics-source-note">
      Forma de pagamento registrada em {sales.paymentCoverage.informedOrders} de {sales.paymentCoverage.totalOrders} pedidos; {sales.paymentCoverage.unknownOrders} sem informação.
    </p>}
      {tab === 'demographics' && <DemographicInsights insights={customerInsights} />}
      {tab === 'invoiceCpf' && <InvoiceCpfInsights insights={invoiceCpf} />}
      {(tab === 'overview' || tab === 'sales') && <section className="analytics-section"><div className="analytics-section-heading"><div><span className="eyebrow">Vendas</span><h2>{startDate || endDate ? `Vendas de ${startDate || 'início'} até ${endDate || 'hoje'}` : 'Ritmo comercial'}</h2></div><span>{sales.currentRevenue ? `Últimos 30 dias: ${money(sales.currentRevenue)}` : 'Sem vendas no período'}</span></div>{tab === 'overview' && <div className="erp-customer-metrics">{metrics.map(([label, value, detail, Icon]) => <div className="erp-customer-metric" key={label}><Icon size={17} /><strong>{value}</strong><span>{label}</span><small>{detail}</small></div>)}</div>}<div className="analytics-period-grid"><PeriodCard label="Hoje" summary={periods.today} /><PeriodCard label="Esta semana" summary={periods.week} comparison={periods.previousWeek} /><PeriodCard label="Este mês" summary={periods.month} comparison={periods.previousMonth} /></div><div className="analytics-grid"><section className="analytics-panel"><div className="erp-panel-title"><BarChart3 size={17} /><div><h3>Faturamento por dia</h3><p>{startDate || endDate ? 'Filtro aplicado ao período selecionado.' : 'Últimos 31 dias.'}</p></div></div><Bars items={sales.daily} /></section><section className="analytics-panel"><div className="erp-panel-title"><Clock3 size={17} /><div><h3>Vendas por horário</h3><p>{startDate || endDate ? 'Todos os horários com venda no período.' : 'Distribuição dos pedidos registrados.'}</p></div></div><Bars items={sales.hourly} /></section></div><section className="analytics-panel analytics-hour-table"><div className="erp-panel-title"><Clock3 size={17} /><div><h3>Resumo horário</h3><p>O filtro mostra cada faixa horária dentro do período.</p></div></div>{sales.hourly.length ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Horário</th><th>Faturamento</th></tr></thead><tbody>{sales.hourly.map((item) => <tr key={item.label}><td>{item.label}</td><td><strong>{money(item.value)}</strong></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">Nenhuma venda no período selecionado.</div>}</section><div className="analytics-grid"><section className="analytics-panel"><div className="erp-panel-title"><ShoppingBag size={17} /><div><h3>Produtos vendidos</h3><p>Unidades e faturamento no período.</p></div></div>{sales.products?.length ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Produto</th><th>Unidades</th><th>Faturamento</th></tr></thead><tbody>{sales.products.map((item) => <tr key={item.title}><td><strong>{item.title}</strong><small>{item.category}</small></td><td>{item.quantity}</td><td>{money(item.revenue)}</td></tr>)}</tbody></table></div> : <div className="erp-empty-data">Nenhum produto vendido no período.</div>}</section><section className="analytics-panel"><div className="erp-panel-title"><CircleDollarSign size={17} /><div><h3>Formas de pagamento</h3><p>Valor e quantidade de compras.</p></div></div>{sales.payments?.length ? <div className="analytics-category-list">{sales.payments.map((item) => <div key={item.method}><div><strong>{item.label}</strong><span>{money(item.value)} · {item.orders} compra(s)</span></div></div>)}</div> : <div className="erp-empty-data">Nenhum pagamento no período.</div>}</section></div><section className="analytics-panel"><div className="erp-panel-title"><ShoppingBag size={17} /><div><h3>Compras registradas</h3><p>Pedido, horário, cliente, pagamento e valor.</p></div></div>{sales.purchases?.length ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Pedido</th><th>Data e hora</th><th>Cliente</th><th>Pagamento</th><th>Itens</th><th>Valor</th></tr></thead><tbody>{sales.purchases.map((item) => <tr key={item.id}><td><strong>{item.id}</strong></td><td>{item.date}</td><td>{item.customer}</td><td>{item.paymentLabel}</td><td>{item.items}</td><td><strong>{money(item.value)}</strong></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">Nenhuma compra registrada no período.</div>}</section></section>}
  {(tab === 'overview' || tab === 'profitability') && <ProfitabilityInsights profitability={profitability} />}
  {(tab === 'overview' || tab === 'inventory') && <InventoryInsights inventory={inventory} />}
  {(tab === 'overview' || tab === 'customers') && <section className="analytics-section"><div className="analytics-section-heading"><div><span className="eyebrow">Comportamento</span><h2>Como os clientes compram</h2></div><span>{customers.total} cliente(s) identificado(s)</span></div><div className="erp-customer-metrics"><div className="erp-customer-metric"><Users size={17} /><strong>{customers.newCustomers}</strong><span>Clientes novos</span><small>Primeira compra nos últimos 30 dias</small></div><div className="erp-customer-metric"><ShoppingBag size={17} /><strong>{customers.recurringCustomers}</strong><span>Clientes recorrentes</span><small>Mais de um pedido registrado</small></div><div className="erp-customer-metric"><Activity size={17} /><strong>{customers.purchaseFrequency.toFixed(1).replace('.', ',')}</strong><span>Frequência de compra</span><small>Pedidos por cliente</small></div><div className="erp-customer-metric"><CircleDollarSign size={17} /><strong>{money(customers.averageTicket)}</strong><span>Ticket médio</span><small>Valor médio por pedido</small></div></div><div className="analytics-grid"><section className="analytics-panel"><h3>Valor gasto por cliente</h3>{customers.spending?.length ? <div className="erp-table-scroll"><table className="erp-table"><thead><tr><th>Cliente</th><th>Pedidos</th><th>Total gasto</th></tr></thead><tbody>{customers.spending.map((customer) => <tr key={customer.email}><td><strong>{customer.name}</strong><small>{customer.email}</small></td><td>{customer.orders}</td><td><strong>{money(customer.spent)}</strong></td></tr>)}</tbody></table></div> : <div className="erp-empty-data">Ainda não há clientes com compras registradas.</div>}</section><section className="analytics-panel"><h3>Produtos mais comprados</h3><Ranking items={customers.topProducts} /></section></div><div className="analytics-grid"><section className="analytics-panel"><h3>Produtos frequentemente comprados juntos</h3><Ranking items={customers.pairs} unit="pedidos" /></section><section className="analytics-panel analytics-callout"><strong>Oportunidade de kits</strong><span>Use as combinações reais acima para criar recomendações, kits e comunicações direcionadas.</span></section></div></section>}
  {(tab === 'overview' || tab === 'customers') && <section className="analytics-section"><div className="analytics-section-heading"><div><span className="eyebrow">Perfil de compra</span><h2>Gênero e faixa etária</h2></div><span>Somente dados opcionais informados pelos próprios clientes</span></div>{!customerInsights.available ? <div className="erp-budget-warning" role="status">Não foi possível conectar ao banco para carregar essas estatísticas.</div> : <><div className="analytics-grid"><section className="analytics-panel"><h3>Compras por gênero informado</h3>{customerInsights.gender.length ? <div className="analytics-category-list">{customerInsights.gender.map((group) => <div key={group.label}><div><strong>{group.label}</strong><span>{group.orders} compra(s) · {group.customers} cliente(s) · {money(group.revenue)}</span></div></div>)}</div> : <div className="erp-empty-data">Ainda não há dados de gênero informados por clientes com compras.</div>}</section><section className="analytics-panel"><h3>Compras por faixa etária</h3>{customerInsights.ageGroups.length ? <div className="analytics-category-list">{customerInsights.ageGroups.map((group) => <div key={group.label}><div><strong>{group.label}</strong><span>{group.orders} compra(s) · {group.customers} cliente(s) · {money(group.revenue)}</span></div></div>)}</div> : <div className="erp-empty-data">Ainda não há datas de nascimento informadas por clientes com compras.</div>}</section></div><p className="analytics-source-note">{customerInsights.customersWithGender} de {customerInsights.customersWithOrders} clientes compradores informaram gênero; {customerInsights.customersWithBirthDate} informaram a data de nascimento. Os dados são apresentados apenas de forma agregada.</p></>}</section>}
  {(tab === 'overview' || tab === 'customers') && <section className="analytics-section">
    <div className="analytics-section-heading">
      <div><span className="eyebrow">Recuperação de vendas</span><h2>Carrinhos parados</h2></div>
      <span>Sem atividade há {abandonedCarts.idleThresholdHours} horas ou mais</span>
    </div>
    {!abandonedCarts.available
      ? <div className="erp-budget-warning" role="status">Não foi possível conectar ao banco para carregar os carrinhos.</div>
      : <>
        <div className="erp-customer-metrics analytics-cart-metrics">
          <div className="erp-customer-metric"><ShoppingBag size={17} /><strong>{abandonedCarts.total}</strong><span>Carrinhos parados</span><small>Carrinhos sem atividade há {abandonedCarts.idleThresholdHours}h+</small></div>
          <div className="erp-customer-metric"><Users size={17} /><strong>{abandonedCarts.customers.length}</strong><span>Clientes identificados</span><small>Com carrinho parado</small></div>
          <div className="erp-customer-metric"><Users size={17} /><strong>{abandonedCarts.guestCarts}</strong><span>Visitantes sem cadastro</span><small>Com carrinho parado</small></div>
        </div>
        {cartActionFeedback && <p className="notification-feedback success" role="status">{cartActionFeedback}</p>}
        <div className="analytics-grid">
          <section className="analytics-panel">
            <h3>Clientes e visitantes com carrinho parado</h3>
            {abandonedCarts.carts.length
              ? <div className="erp-table-scroll"><table className="erp-table">
                <thead><tr><th>Identificação</th><th>Última atividade</th><th>Produtos e quantidades</th><th>Ações</th></tr></thead>
                <tbody>{abandonedCarts.carts.map((cart, index) => <tr key={cart.email || cart.cartRef || `visitante-${index}`}>
                  <td><strong>{cart.name}</strong><small>{cart.email || 'Sem conta identificada'}</small></td>
                  <td>{cart.updatedAt ? new Date(cart.updatedAt).toLocaleString('pt-BR') : 'Data não registrada'}</td>
                  <td>{cart.items.map((item) => `${item.name} (×${formatCartQuantity(item)})`).join(', ')}</td>
                  <td><AbandonedCartActions cart={cart} onCartCleared={(name) => {
                    setCartActionFeedback(`O carrinho de ${name} foi zerado.`);
                    setReloadToken((current) => current + 1);
                  }} /></td>
                </tr>)}</tbody>
              </table></div>
              : <div className="erp-empty-data">Nenhum carrinho com mais de {abandonedCarts.idleThresholdHours} horas sem atividade.</div>}
          </section>
          <section className="analytics-panel">
            <h3>Produtos mais encontrados</h3>
            {abandonedCarts.topProducts.length
              ? <div className="analytics-category-list">{abandonedCarts.topProducts.map((item) => <div key={item.label}><div><strong>{item.label}</strong><span>{item.carts} carrinho(s) · {Number(item.quantity).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} {item.saleUnit === 'Quilograma' ? 'kg' : 'unidade(s)'}</span></div></div>)}</div>
              : <div className="erp-empty-data">Não há produtos em carrinhos parados.</div>}
          </section>
        </div>
        {abandonedCarts.cartsWithoutActivityDate > 0 && <p className="analytics-source-note">{abandonedCarts.cartsWithoutActivityDate} carrinho(s) não têm data de atividade confiável e não foram classificados como parados.</p>}
      </>}
  </section>}
  {(tab === 'overview' || tab === 'customers') && <section className="analytics-section"><div className="analytics-section-heading"><div><span className="eyebrow">Distribuição geográfica</span><h2>Pedidos por região</h2></div><span>{geography.totalOrders - geography.unlocatedOrders} de {geography.totalOrders} pedidos com localização identificada</span></div><div className="analytics-geography-grid"><GeographyRanking title="Estados" items={geography.states} /><GeographyRanking title="Cidades / municípios" items={geography.municipalities} /><GeographyRanking title="Bairros" items={geography.neighborhoods} /></div>{geography.unlocatedOrders > 0 && <p className="analytics-source-note">{geography.unlocatedOrders} pedido(s) sem dados de localização completos não entram nesses rankings.</p>}</section>}
  {(tab === 'overview' || tab === 'customers') && <AddressInsights insights={data.addressInsights} />}
  {tab === 'promotions' && <PromotionInsights promotions={data.promotions} />}
    {data && <div className="analytics-source-note">Fonte: pedidos, catálogo, lotes, perfis, endereços e campanhas persistidos no PostgreSQL. Atualização automática a cada 10 segundos.</div>}
    </div>}
  </div>;
}
