'use client';

import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleDollarSign, Heart, Package, ShoppingCart, Sparkles, TrendingUp } from 'lucide-react';
import { getOrderStatus } from './order-status';

export default function DashboardHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    Promise.all([
      fetch('/api/favorites').then((response) => response.json()),
      fetch('/api/my/orders').then((response) => response.json()),
      fetch('/api/cart').then((response) => response.json()),
    ]).then(([favoriteData, orderData, cartData]) => {
      setFavorites(favoriteData.favorites || []);
      setOrders(orderData.orders || []);
      setCart(cartData.cart || []);
    }).catch(() => {
      setFavorites([]);
      setOrders([]);
      setCart([]);
    });
  }, [status]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const timeout = window.setTimeout(() => router.push('/login'), 150);
      return () => window.clearTimeout(timeout);
    }
  }, [status, router]);

  if (status === 'loading') return <div className="loading-screen">Carregando...</div>;
  if (!session) return null;

  const totalSpent = orders.reduce((total, order) => total + (Number(String(order.total || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0), 0);
  const metricData = [
    ['Pedidos realizados', orders.length || 0, 'pedidos registrados', Package],
    ['Total gasto', orders.length ? `R$ ${totalSpent.toFixed(2).replace('.', ',')}` : 'Sem dados', orders.length ? 'compras registradas' : 'sem compras registradas', CircleDollarSign],
    ['Produtos favoritos', favorites.length, 'itens salvos', Heart],
    ['Itens no carrinho', cart.reduce((total, item) => total + (item.quantity || 1), 0), 'itens atuais', ShoppingCart],
  ];

  return (
    <div className="page-section dashboard-home">
      <section className="dashboard-hero">
        <div className="hero-copy"><span className="eyebrow">Painel do cliente</span><h1>Olá, {session.user?.name?.split(' ')[0] || 'cliente'}!</h1><p>Dados da sua conta, favoritos, carrinho e pedidos registrados.</p></div>
        <div className="hero-card"><div className="hero-card-label"><Sparkles size={16} /><span>Atividade real</span></div><div className="hero-card-value">{orders.length ? `${orders.length} pedido(s)` : 'Sem pedidos'}</div><div className="hero-card-sub">Nenhum dado demonstrativo</div></div>
      </section>

      <div className="stats-panel-home">{metricData.map(([label, value, detail, Icon]) => <div key={label} className="metric-mini"><div className="metric-mini-icon"><Icon size={18} /></div><div className="metric-mini-value">{value}</div><div className="metric-mini-label">{label}</div><div className="metric-mini-detail">{detail}</div></div>)}</div>

      <div className="home-grid"><div className="panel-box profile-panel"><div className="panel-header compact"><h3>Resumo do perfil</h3><span className="status-pill ok">Autenticado</span></div><div className="profile-preview"><div className="avatar-large">{session.user?.name?.[0]?.toUpperCase() || 'U'}</div><div><strong>{session.user?.name || 'Cliente'}</strong><span>{session.user?.email || 'E-mail não informado'}</span></div></div><div className="profile-detail-grid"><div><label>Localização</label><strong>Sem endereço</strong></div><div><label>Entrega</label><strong>Não selecionada</strong></div><div><label>Plano</label><strong>Sem plano</strong></div></div></div><div className="panel-box"><div className="panel-header compact"><h3>Últimos pedidos</h3></div>{orders.length ? <ul className="mini-list">{orders.slice(0, 4).map((order) => { const info = getOrderStatus(order.status); return <li key={order.id}><span>{order.id}</span><strong className={`mini-order-status ${info.tone}`}><span className="order-status-light" />{info.label}</strong><em>{order.total}</em></li>; })}</ul> : <div className="erp-empty-data">Nenhum pedido registrado.</div>}</div></div>

      <div className="bottom-grid"><div className="panel-box"><div className="panel-header compact"><h3>Produtos favoritos</h3></div>{favorites.length ? <div className="favorites-mini-list">{favorites.slice(0, 5).map((item) => <div key={item.name} className="favorite-mini-row"><div className="favorite-mini-icon">◫</div><div><strong>{item.name}</strong><span>{item.category || 'Categoria não informada'}</span></div><em>{item.price || 'Sem preço'}</em></div>)}</div> : <div className="erp-empty-data">Nenhum favorito registrado.</div>}</div><div className="panel-box"><div className="panel-header compact"><h3>Atividade recente</h3><TrendingUp size={16} color="#16a34a" /></div><div className="erp-empty-data">A atividade aparecerá aqui quando houver ações registradas.</div></div></div>
    </div>
  );
}
