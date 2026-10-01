'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, BarChart3, Bell, FileText, History, LayoutDashboard, Package, ShoppingCart, TicketPercent, Truck, Users } from 'lucide-react';
import { useEffect, useState } from 'react';

const erpNavigation = [
  { label: 'Dashboard', href: '/erp', icon: LayoutDashboard },
  { label: 'Cadastro de Produto', href: '/erp/catalog', icon: Package },
  { label: 'Produtos', href: '/erp/products', icon: Package },
  { label: 'Auditoria de produtos', href: '/erp/product-audit', icon: History },
  { label: 'Pedidos', href: '/erp/orders', icon: ShoppingCart },
  { label: 'Clientes', href: '/erp/customers', icon: Users },
  { label: 'Comunicação', href: '/erp/communications', icon: Bell },
  { label: 'Fornecedores', href: '/erp/suppliers', icon: Truck },
  { label: 'Cupons', href: '/erp/promotions', icon: TicketPercent },
  { label: 'Analytics', href: '/erp/analytics', icon: Activity },
  { label: 'Relatórios', href: '/erp/reports', icon: BarChart3 },
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
      <aside className="erp-sidebar">
        <div className="erp-brand">
          <img className="erp-brand-mark" src="/imagens/logo/logo-hj.webp" alt="Logo Hoje" />
          <div><span>HOJE</span><strong>ERP Operacional</strong></div>
        </div>
        <nav className="erp-nav" aria-label="Navegação ERP">
          {erpNavigation.map(({ label, href, icon: Icon }) => {
            const active = pathname === href || (href !== '/erp' && pathname.startsWith(href));
            return <Link key={label} href={href} className={`erp-nav-item ${active ? 'active' : ''}`}><Icon size={17} /><span>{label}</span>{label === 'Pedidos' && newOrders > 0 && <b className="erp-nav-badge">{newOrders}</b>}</Link>;
          })}
        </nav>
        <div className="erp-sidebar-footer"><FileText size={15} /><span>Dados auditáveis</span></div>
      </aside>
      <main className="erp-main">{children}</main>
    </div>
  );
}
