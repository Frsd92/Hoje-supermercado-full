'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, Award, BarChart3, Bell, CalendarDays, CircleDollarSign, FileText, History, LayoutDashboard, LayoutTemplate, MapPin, Package, Plus, ShoppingCart, TicketPercent, TrendingUp, Truck, Users, Zap } from 'lucide-react';
import { useEffect, useState } from 'react';

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
    items: [{ label: 'Fornecedores', href: '/erp/suppliers', icon: Truck }],
  },
  {
    label: 'Financeiro',
    items: [{ label: 'Financeiro', href: '/erp/financeiro', icon: CircleDollarSign }],
  },
  {
    label: 'Operação',
    items: [
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
    ],
  },
];

export default function ERPLayout({ children }) {
  const pathname = usePathname();
  const [newOrders, setNewOrders] = useState(0);

  useEffect(() => {
    if (pathname === '/erp/login') return undefined;

    const loadNewOrders = () => fetch('/api/erp/orders').then((response) => response.json()).then(({ orders = [] }) => {
      const acknowledged = JSON.parse(localStorage.getItem('erp-acknowledged-orders') || '[]');
      setNewOrders(orders.filter((order) => order.status === 'Recebido' && !acknowledged.includes(order.id)).length);
    }).catch(() => setNewOrders(0));
    loadNewOrders();
    window.addEventListener('erp-orders-updated', loadNewOrders);
    return () => window.removeEventListener('erp-orders-updated', loadNewOrders);
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
          {erpNavigationGroups.map((group) => <div className="erp-nav-group" key={group.label}>
            <span className="erp-nav-group-label">{group.label}</span>
            <div className="erp-nav-group-items">
              {group.items.map(({ label, href, icon: Icon }) => {
                const active = pathname === href || (href !== '/erp' && pathname.startsWith(href));
                const content = <><Icon size={17} aria-hidden="true" /><span>{label}</span>{label === 'Pedidos' && newOrders > 0 && <><span className="erp-nav-badge" aria-hidden="true">{newOrders}</span><span className="visually-hidden">{newOrders} novos pedidos</span></>}</>;
                const className = `erp-nav-item ${active ? 'active' : ''}`;
                return <Link key={label} href={href} className={className} aria-current={active ? 'page' : undefined}>{content}</Link>;
              })}
            </div>
          </div>)}
        </nav>
        <div className="erp-sidebar-footer"><FileText size={15} /><span>Dados auditáveis</span></div>
      </aside>
      <main className="erp-main" id="erp-main-content" tabIndex="-1">{children}</main>
    </div>
  );
}
