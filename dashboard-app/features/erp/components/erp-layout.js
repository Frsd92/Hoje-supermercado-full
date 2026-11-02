'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Award, BarChart3, Bell, CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, FileText, History, LayoutDashboard, LayoutTemplate, MapPin, Package, PlugZap, Plus, ReceiptText, ShoppingBag, ShoppingCart, TicketPercent, TrendingUp, Truck, Users, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getErpActionCountsFromSummary } from '../action-notifications.js';

const erpNavigationGroups = [
  {
    label: 'Visão geral',
    items: [{ label: 'Dashboard', href: '/erp', icon: LayoutDashboard }],
  },
  {
    label: 'Comercial',
    items: [
      { label: 'Vendas', href: '/erp/sales', icon: ShoppingBag },
      { label: 'Pedidos', href: '/erp/orders', icon: ShoppingCart },
      { label: 'Clientes', href: '/erp/customers', icon: Users },
      { label: 'Comunicação', href: '/erp/communications', icon: Bell },
      { label: 'Cupons', href: '/erp/promotions', icon: TicketPercent },
      { label: 'Missões e pontos', href: '/erp/fidelidade', icon: Award },
      { label: 'Ofertas Relâmpago', href: '/erp/flash-offers', icon: Zap },
    ],
  },
  {
    label: 'Catálogo e loja',
    items: [
      { label: 'Cadastro de Produto', href: '/erp/catalog', icon: Package },
      { label: 'Produtos', href: '/erp/products', icon: Package },
      { label: 'Histórico de preços', href: '/erp/price-history', icon: TrendingUp },
      { label: 'Auditoria de produtos', href: '/erp/product-audit', icon: History },
      { label: 'Layout da loja', href: '/erp/layout', icon: LayoutTemplate },
    ],
  },
  {
    label: 'Suprimentos',
    items: [
      { label: 'Fornecedores', href: '/erp/suppliers', icon: Truck },
      { label: 'NF-e / DANFE', href: '/erp/suppliers/invoices', icon: ReceiptText },
    ],
  },
  {
    label: 'Integrações',
    items: [{ label: 'Bling', href: '/erp/integrations/bling', icon: PlugZap }],
  },
  {
    label: 'Financeiro',
    items: [
      { label: 'Início', href: '/erp/financeiro', icon: CircleDollarSign },
      { label: 'DRE', href: '/erp/financeiro/dre', icon: FileText },
      { label: 'Fluxo de Caixa', href: '/erp/financeiro/fluxo-de-caixa', icon: TrendingUp },
      { label: 'Despesas e vencimentos', href: '/erp/financeiro/despesas', icon: CalendarDays },
      { label: 'Mostradores Financeiro', href: '/erp/financeiro/mostradores-financeiro', icon: BarChart3 },
      { label: 'Mostradores Contador', href: '/erp/financeiro/mostradores-contador', icon: ReceiptText },
    ],
  },
  {
    label: 'Operação',
    items: [
      { label: 'Balanço de estoque', href: '/erp/balanco-estoque', icon: ClipboardList },
      { label: 'Validade', href: '/erp/validade', icon: CalendarDays },
      { label: 'Registrar lote', href: '/erp/registrar-lote', icon: Plus },
      { label: 'Regiões atendidas', href: '/erp/service-regions', icon: MapPin },
    ],
  },
  {
    label: 'Inteligência',
    items: [
      { label: 'Analytics', href: '/erp/analytics', icon: Activity },
      { label: 'Relatórios', href: '/erp/reports', icon: BarChart3 },
      { label: 'Dados auditáveis', href: '/erp/audit', icon: FileText },
    ],
  },
];

export default function ERPLayout({ children }) {
  const pathname = usePathname();
  const [actionCounts, setActionCounts] = useState({ customers: 0, orders: 0, newCustomers: 0, newOrders: 0 });
  const [financeExpanded, setFinanceExpanded] = useState(() => pathname.startsWith('/erp/financeiro'));

  useEffect(() => {
    if (pathname.startsWith('/erp/financeiro')) setFinanceExpanded(true);
  }, [pathname]);

  useEffect(() => {
    if (pathname === '/erp/login') return undefined;

    let active = true;
    let acknowledgementVersion = 0;
    const loadActionCounts = async () => {
      try {
        const checkVersion = acknowledgementVersion;
        const lastSignupCheck = localStorage.getItem('erp-last-customer-signup-check');
        const lastChangeCheck = localStorage.getItem('erp-last-customer-change-check');
        const lastOrderCheck = localStorage.getItem('erp-last-order-arrival-check');
        const initialSince = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
        const signupSince = lastSignupCheck || initialSince;
        const changeSince = lastChangeCheck || initialSince;
        const orderSince = lastOrderCheck || new Date().toISOString();
        const [actionResponse, signupResponse, changeResponse, orderResponse] = await Promise.all([
          fetch('/api/erp/action-counts', { cache: 'no-store' }),
          fetch(`/api/erp/customer-signups?since=${encodeURIComponent(signupSince)}`, { cache: 'no-store' }),
          fetch(`/api/erp/customer-changes?since=${encodeURIComponent(changeSince)}`, { cache: 'no-store' }),
          fetch(`/api/erp/order-arrivals?since=${encodeURIComponent(orderSince)}`, { cache: 'no-store' }),
        ]);
        const [actionData, signupData, changeData, orderData] = await Promise.all([
          actionResponse.json(),
          signupResponse.json(),
          changeResponse.json(),
          orderResponse.json(),
        ]);
        if (!actionResponse.ok) throw new Error(actionData.error || 'Não foi possível carregar os indicadores de ações pendentes.');
        if (!signupResponse.ok) throw new Error(signupData.error || 'Não foi possível verificar novos cadastros.');
        if (!changeResponse.ok) throw new Error(changeData.error || 'Não foi possível verificar alterações cadastrais.');
        if (!orderResponse.ok) throw new Error(orderData.error || 'Não foi possível verificar novos pedidos.');
        if (!Array.isArray(actionData.pendingOrderIds) || !Number.isFinite(actionData.pendingCustomerActionCount)) {
          throw new Error('A resposta de ações pendentes está inválida.');
        }
        if (!Array.isArray(signupData.signups) || !signupData.checkedAt) throw new Error('A resposta de novos cadastros está inválida.');
        if (!Array.isArray(changeData.changes) || !changeData.checkedAt) throw new Error('A resposta de alterações cadastrais está inválida.');
        if (!Array.isArray(orderData.orders) || !orderData.checkedAt) throw new Error('A resposta de novos pedidos está inválida.');
        const storedAcknowledged = JSON.parse(localStorage.getItem('erp-acknowledged-orders') || '[]');
        const acknowledged = Array.isArray(storedAcknowledged) ? storedAcknowledged : [];
        const storedOrderArrivals = JSON.parse(localStorage.getItem('erp-unacknowledged-order-arrivals') || '[]');
        const unacknowledgedOrderArrivals = Array.isArray(storedOrderArrivals) ? storedOrderArrivals : [];
        const storedSignups = JSON.parse(localStorage.getItem('erp-unacknowledged-customer-signups') || '[]');
        const unacknowledged = Array.isArray(storedSignups) ? storedSignups : [];
        const storedCustomerChanges = JSON.parse(localStorage.getItem('erp-unacknowledged-customer-changes') || '[]');
        const unacknowledgedChanges = Array.isArray(storedCustomerChanges) ? storedCustomerChanges : [];
        const newIds = signupData.signups.map((customer) => customer.id);
        const acknowledgedDuringCheck = checkVersion !== acknowledgementVersion;
        const currentIds = acknowledgedDuringCheck ? unacknowledged : [...new Set([...unacknowledged, ...newIds])];
        const newChangeIds = changeData.changes.map((change) => change.id);
        const currentChangeIds = acknowledgedDuringCheck
          ? unacknowledgedChanges
          : [...new Set([...unacknowledgedChanges, ...newChangeIds])];
        const newOrderIds = orderData.orders.map((order) => order.id);
        const currentOrderIds = acknowledgedDuringCheck
          ? unacknowledgedOrderArrivals
          : [...new Set([...unacknowledgedOrderArrivals, ...newOrderIds])];
        const acknowledgedOrderIds = acknowledged;
        const visibleOrderArrivals = currentOrderIds;
        localStorage.setItem('erp-last-customer-signup-check', signupData.checkedAt);
        localStorage.setItem('erp-last-customer-change-check', changeData.checkedAt);
        localStorage.setItem('erp-last-order-arrival-check', orderData.checkedAt);
        localStorage.setItem('erp-unacknowledged-customer-signups', JSON.stringify(currentIds));
        localStorage.setItem('erp-unacknowledged-customer-changes', JSON.stringify(currentChangeIds));
        localStorage.setItem('erp-acknowledged-orders', JSON.stringify(acknowledgedOrderIds));
        localStorage.setItem('erp-unacknowledged-order-arrivals', JSON.stringify(visibleOrderArrivals));
        if (active) {
          setActionCounts({
            ...getErpActionCountsFromSummary(
              actionData.pendingOrderIds,
              actionData.pendingCustomerActionCount,
              acknowledgedOrderIds,
              currentIds.length + currentChangeIds.length,
              visibleOrderArrivals,
            ),
            newCustomers: currentIds.length + currentChangeIds.length,
            newOrders: visibleOrderArrivals.filter((id) => !acknowledgedOrderIds.includes(id)).length,
          });
          if (!acknowledgedDuringCheck && newOrderIds.length) {
            window.dispatchEvent(new CustomEvent('erp-new-orders-detected', { detail: { orderIds: newOrderIds } }));
          }
          if (!acknowledgedDuringCheck && pathname === '/erp/customers' && newChangeIds.some((id) => !unacknowledgedChanges.includes(id))) {
            window.dispatchEvent(new Event('erp-customer-profile-changes-updated'));
          }
        }
      } catch (error) {
        console.error('Não foi possível atualizar os indicadores de ações pendentes do ERP:', error);
      }
    };
    void loadActionCounts();
    const refresh = () => { void loadActionCounts(); };
    const acknowledgeSignups = () => {
      acknowledgementVersion += 1;
      localStorage.setItem('erp-unacknowledged-customer-signups', '[]');
      localStorage.setItem('erp-unacknowledged-customer-changes', '[]');
      setActionCounts((current) => ({
        ...current,
        customers: Math.max(0, current.customers - current.newCustomers),
        newCustomers: 0,
      }));
    };
    const acknowledgeOrders = () => {
      acknowledgementVersion += 1;
      const currentAcknowledged = JSON.parse(localStorage.getItem('erp-acknowledged-orders') || '[]');
      const acknowledgedIds = Array.isArray(currentAcknowledged) ? currentAcknowledged : [];
      const storedArrivals = JSON.parse(localStorage.getItem('erp-unacknowledged-order-arrivals') || '[]');
      const arrivals = Array.isArray(storedArrivals) ? storedArrivals : [];
      localStorage.setItem('erp-acknowledged-orders', JSON.stringify([...new Set([...acknowledgedIds, ...arrivals])]));
      localStorage.setItem('erp-unacknowledged-order-arrivals', '[]');
      setActionCounts((current) => ({ ...current, orders: Math.max(0, current.orders - current.newOrders), newOrders: 0 }));
      void loadActionCounts();
    };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('erp-customer-updates-acknowledged', acknowledgeSignups);
    window.addEventListener('erp-orders-acknowledged', acknowledgeOrders);
    window.addEventListener('erp-orders-updated', refresh);
    window.addEventListener('erp-customer-actions-updated', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
      window.removeEventListener('erp-customer-updates-acknowledged', acknowledgeSignups);
      window.removeEventListener('erp-orders-acknowledged', acknowledgeOrders);
      window.removeEventListener('erp-orders-updated', refresh);
      window.removeEventListener('erp-customer-actions-updated', refresh);
    };
  }, [pathname]);

  if (pathname === '/erp/login') return children;

  return (
    <div className="erp-shell">
      <a className="erp-skip-link" href="#erp-main-content">Pular para o conteúdo principal</a>
      <aside className="erp-sidebar">
        <Link className="erp-brand" href="/erp" aria-label="Hoje ERP — ir para o dashboard">
          <img className="erp-brand-mark" src="/imagens/logo/logo-hj.webp" alt="" />
          <div><span>HOJE</span><strong>ERP Operacional</strong></div>
        </Link>
        <nav className="erp-nav" aria-label="Navegação ERP">
          {erpNavigationGroups.map((group) => {
            const isFinance = group.label === 'Financeiro';
            const expanded = isFinance ? financeExpanded : true;
            return <div className={`erp-nav-group${isFinance ? ' erp-nav-group-finance' : ''}`} key={group.label}>
            {isFinance
              ? <button type="button" className="erp-nav-group-toggle" aria-expanded={expanded} aria-controls="erp-finance-nav-items" onClick={() => setFinanceExpanded((value) => !value)}>
                <CircleDollarSign size={17} aria-hidden="true" /><span>{group.label}</span><ChevronDown size={15} aria-hidden="true" />
              </button>
              : <span className="erp-nav-group-label">{group.label}</span>}
            {expanded && <div className="erp-nav-group-items" id={isFinance ? 'erp-finance-nav-items' : undefined}>
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || (href !== '/erp' && href !== '/erp/financeiro' && pathname.startsWith(href));
                const pendingActions = label === 'Pedidos' ? actionCounts.orders : label === 'Clientes' ? actionCounts.customers : 0;
                const actionLabel = label === 'Pedidos'
                  ? `${pendingActions} pedido(s) novo(s) ou ação(ões) relacionada(s) a pedidos`
                  : `${pendingActions} cadastro(s) novo(s), alteração(ões) cadastral(is) ou solicitação(ões) de cliente para consultar`;
                const content = <><Icon size={17} aria-hidden="true" /><span>{label}</span>{pendingActions > 0 && <><span className="erp-nav-badge" aria-hidden="true">{pendingActions}</span><span className="visually-hidden">{actionLabel}</span></>}</>;
                const className = `erp-nav-item ${active ? 'active' : ''}`;
                return <Link key={label} href={href} className={className} aria-current={active ? 'page' : undefined}>{content}</Link>;
              })}
            </div>}
          </div>;
          })}
        </nav>
      </aside>
      <main className="erp-main" id="erp-main-content" tabIndex="-1">{children}</main>
    </div>
  );
}
