'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Award, BarChart3, Bell, CalendarDays, ChevronDown, CircleDollarSign, ClipboardList, FileText, History, LayoutDashboard, LayoutTemplate, MapPin, Package, PlugZap, Plus, ReceiptText, ShoppingCart, TicketPercent, TrendingUp, Truck, Users, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { getErpActionCounts } from '../action-notifications.js';

const erpNavigationGroups = [
  {
    label: 'Visão geral',
    items: [{ label: 'Dashboard', href: '/erp', icon: LayoutDashboard }],
  },
  {
    label: 'Comercial',
    items: [
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
  const [actionCounts, setActionCounts] = useState({ customers: 0, orders: 0 });
  const [financeExpanded, setFinanceExpanded] = useState(() => pathname.startsWith('/erp/financeiro'));

  useEffect(() => {
    if (pathname.startsWith('/erp/financeiro')) setFinanceExpanded(true);
  }, [pathname]);

  useEffect(() => {
    if (pathname === '/erp/login') return undefined;

    let active = true;
    const loadActionCounts = async () => {
      try {
        const response = await fetch('/api/erp/orders', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os indicadores de ações pendentes.');
        if (!Array.isArray(data.orders)) throw new Error('A resposta de pedidos para os indicadores está inválida.');
        const storedAcknowledged = JSON.parse(localStorage.getItem('erp-acknowledged-orders') || '[]');
        const acknowledged = Array.isArray(storedAcknowledged) ? storedAcknowledged : [];
        if (active) setActionCounts(getErpActionCounts(data.orders, acknowledged));
      } catch (error) {
        console.error('Não foi possível atualizar os indicadores de ações pendentes do ERP:', error);
      }
    };
    void loadActionCounts();
    const refresh = () => { void loadActionCounts(); };
    const interval = window.setInterval(refresh, 30_000);
    window.addEventListener('erp-orders-updated', refresh);
    window.addEventListener('erp-customer-actions-updated', refresh);
    return () => {
      active = false;
      window.clearInterval(interval);
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
                  ? `${pendingActions} pedido(s) ou ação(ões) aguardando atendimento`
                  : `${pendingActions} solicitação(ões) de cliente aguardando atendimento`;
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
