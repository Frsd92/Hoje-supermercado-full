'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CircleDollarSign, Heart, Package, ShoppingCart, Sparkles, TrendingUp } from 'lucide-react';
import { formatCurrency, getBudgetProgress, getCurrentMonthSpend } from './budget';
import { readLocalBudget } from './budget-storage';
import { getCartItemCount } from './cart-utils';
import { getOrderStatus } from './order-status';

export default function DashboardHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [profile, setProfile] = useState({ monthlyBudget: 0, photo: null, googlePhoto: '' });
  const [deliveryAddress, setDeliveryAddress] = useState(null);

  useEffect(() => {
    if (status !== 'authenticated') return;
    Promise.all([
      fetch('/api/favorites').then((response) => response.json()),
      fetch('/api/my/orders').then((response) => response.json()),
      fetch('/api/profile').then((response) => response.ok ? response.json() : { profile: null }),
    ]).then(([favoriteData, orderData, profileData]) => {
      setFavorites(favoriteData.favorites || []);
      setOrders(orderData.orders || []);
      setProfile({
        ...(profileData.profile || { monthlyBudget: 0, photo: null, googlePhoto: '' }),
        monthlyBudget: readLocalBudget(session?.user?.email) ?? profileData.profile?.monthlyBudget ?? 0,
      });
    }).catch(() => {
      setFavorites([]);
      setOrders([]);
      setProfile({ monthlyBudget: 0, photo: null, googlePhoto: '' });
    });
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    const applyCart = (nextCart) => {
      if (Array.isArray(nextCart)) setCart(nextCart);
    };
    const readLocalCart = () => {
      try {
        const storedCart = localStorage.getItem(cartStorageKey);
        if (storedCart === null) return null;
        const parsedCart = JSON.parse(storedCart);
        return Array.isArray(parsedCart) ? parsedCart : null;
      } catch {
        return null;
      }
    };
    const localCart = readLocalCart();
    if (localCart) {
      applyCart(localCart);
    } else {
      fetch('/api/cart', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('Não foi possível carregar o carrinho.');
          return response.json();
        })
        .then(({ cart: savedCart = [] }) => {
          if (!active) return;
          const latestLocalCart = readLocalCart();
          if (latestLocalCart) {
            applyCart(latestLocalCart);
            return;
          }
          applyCart(savedCart);
          localStorage.setItem(cartStorageKey, JSON.stringify(savedCart));
        })
        .catch((error) => console.error(error));
    }

    const handleCartUpdated = (event) => {
      const updatedCart = Array.isArray(event.detail) ? event.detail : readLocalCart();
      if (updatedCart) applyCart(updatedCart);
    };
    const handleStorage = (event) => {
      if (event.key === cartStorageKey) applyCart(readLocalCart() || []);
    };
    window.addEventListener('dashboard-cart-updated', handleCartUpdated);
    window.addEventListener('storage', handleStorage);
    return () => {
      active = false;
      window.removeEventListener('dashboard-cart-updated', handleCartUpdated);
      window.removeEventListener('storage', handleStorage);
    };
  }, [status, session?.user?.email]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const applyLocalBudget = () => {
      const budget = readLocalBudget(session?.user?.email);
      if (budget !== null) setProfile((current) => ({ ...current, monthlyBudget: budget }));
    };
    applyLocalBudget();
    window.addEventListener('dashboard-budget-updated', applyLocalBudget);
    window.addEventListener('storage', applyLocalBudget);
    return () => {
      window.removeEventListener('dashboard-budget-updated', applyLocalBudget);
      window.removeEventListener('storage', applyLocalBudget);
    };
  }, [status, session?.user?.email]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const storageKey = `hoje-dashboard-delivery-address-${session?.user?.email || 'guest'}`;
    fetch('/api/addresses', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Não foi possível carregar o endereço de entrega.');
        return response.json();
      })
      .then(({ addresses = [] }) => {
        if (!active) return;
        const preferredId = localStorage.getItem(storageKey);
        const selected = addresses.find((address) => String(address.id) === preferredId)
          || addresses.find((address) => address.type === 'Padrão')
          || addresses[0]
          || null;
        setDeliveryAddress(selected);
      })
      .catch(() => {
        if (active) setDeliveryAddress(null);
      });
    const handleAddressSelected = () => {
      fetch('/api/addresses', { cache: 'no-store' })
        .then((response) => response.json())
        .then(({ addresses = [] }) => {
          if (!active) return;
          const selectedId = localStorage.getItem(storageKey);
          setDeliveryAddress(addresses.find((address) => String(address.id) === selectedId) || null);
        })
        .catch(() => {
          if (active) setDeliveryAddress(null);
        });
    };
    const handleCartUpdated = (event) => {
      if (Array.isArray(event.detail)) setCart(event.detail);
    };
    window.addEventListener('dashboard-address-selected', handleAddressSelected);
    window.addEventListener('dashboard-cart-updated', handleCartUpdated);
    return () => {
      active = false;
      window.removeEventListener('dashboard-address-selected', handleAddressSelected);
      window.removeEventListener('dashboard-cart-updated', handleCartUpdated);
    };
  }, [status, session?.user?.email]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      const timeout = window.setTimeout(() => router.push('/login'), 150);
      return () => window.clearTimeout(timeout);
    }
  }, [status, router]);

  if (status === 'loading') return <div className="loading-screen">Carregando...</div>;
  if (!session) return null;

  const monthSpend = getCurrentMonthSpend(orders);
  const budgetProgress = getBudgetProgress(monthSpend, profile.monthlyBudget);
  const cartCount = getCartItemCount(cart);
  const metricData = [
    { label: 'Pedidos realizados', value: orders.length, detail: 'pedidos registrados', Icon: Package },
    { label: 'Orçamento do mês', value: profile.monthlyBudget ? formatCurrency(profile.monthlyBudget) : 'Não definido', detail: `${formatCurrency(monthSpend)} gastos neste mês`, Icon: CircleDollarSign, budget: true },
    { label: 'Produtos favoritos', value: favorites.length, detail: 'itens salvos', Icon: Heart },
    { label: 'Itens no carrinho', value: cartCount, detail: 'itens atuais', Icon: ShoppingCart },
  ];

  return (
    <div className="page-section dashboard-home">
      <section className="dashboard-hero">
        <div className="hero-copy"><span className="eyebrow">Painel do cliente</span><h1>Olá, {(profile.fullName || session.user?.name || 'cliente').split(' ')[0]}!</h1><p>Dados da sua conta, favoritos, carrinho e pedidos registrados.</p></div>
        <div className="hero-card"><div className="hero-card-label"><Sparkles size={16} /><span>Atividade real</span></div><div className="hero-card-value">{orders.length ? `${orders.length} pedido(s)` : 'Sem pedidos'}</div><div className="hero-card-sub">Nenhum dado demonstrativo</div></div>
      </section>

      <div className="stats-panel-home">{metricData.map(({ label, value, detail, Icon, budget }) => {
        const isCartCard = label === 'Itens no carrinho';
        const cardClassName = `metric-mini ${budget ? 'budget-metric' : ''}${isCartCard ? ' cart-metric-clickable' : ' metric-mini-link'}`;
        const cardContent = <>
          <div className="metric-mini-icon"><Icon size={18} /></div>
          <div className="metric-mini-value">{value}</div>
          <div className="metric-mini-label">{label}</div>
          <div className="metric-mini-detail">{detail}</div>
          {budget && <><div className="budget-meter" role="progressbar" aria-label="Uso do orçamento mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(budgetProgress)}><span className={budgetProgress >= 80 ? 'near-limit' : ''} style={{ width: `${budgetProgress}%` }} /></div><span className="budget-edit-link">Ver orçamento</span></>}
        </>;
        if (isCartCard) {
          return <button key={label} type="button" className={cardClassName} aria-label={`Abrir carrinho com ${cartCount} itens`} onClick={() => window.dispatchEvent(new Event('dashboard-open-cart'))}>{cardContent}</button>;
        }
        const href = budget ? '/dashboard/budget'
          : label === 'Pedidos realizados' ? '/dashboard/orders'
            : '/dashboard/favorites';
        return <Link key={label} href={href} className={cardClassName}>{cardContent}</Link>;
      })}</div>

      <div className="home-grid"><div className="panel-box profile-panel"><div className="panel-header compact"><h3>Resumo do perfil</h3><span className="status-pill ok">Autenticado</span></div><div className="profile-preview"><div className="avatar-large">{profile.photo || profile.googlePhoto || session.user?.image ? <img src={profile.photo || profile.googlePhoto || session.user?.image} alt="" /> : session.user?.name?.[0]?.toUpperCase() || 'U'}</div><div><strong>{profile.fullName || session.user?.name || 'Cliente'}</strong><span>{session.user?.email || 'E-mail não informado'}</span></div></div><div className="profile-detail-grid"><div><label>Localização</label><strong>{deliveryAddress?.city || deliveryAddress?.street || 'Sem endereço'}</strong></div><div><label>Entrega</label><strong>{deliveryAddress?.title || 'Não selecionada'}</strong></div><div><label>Orçamento mensal</label><strong>{profile.monthlyBudget ? formatCurrency(profile.monthlyBudget) : 'Não definido'}</strong></div></div></div><div className="panel-box"><div className="panel-header compact"><h3>Últimos pedidos</h3></div>{orders.length ? <ul className="mini-list">{orders.slice(0, 4).map((order) => { const info = getOrderStatus(order.status); return <li key={order.id}><span>{order.id}</span><strong className={`mini-order-status ${info.tone}`}><span className="order-status-light" />{info.label}</strong><em>{order.total}</em></li>; })}</ul> : <div className="erp-empty-data">Nenhum pedido registrado.</div>}</div></div>

      <div className="bottom-grid"><div className="panel-box"><div className="panel-header compact"><h3>Produtos favoritos</h3></div>{favorites.length ? <div className="favorites-mini-list">{favorites.slice(0, 5).map((item) => <div key={item.name} className="favorite-mini-row"><div className="favorite-mini-icon">◫</div><div><strong>{item.name}</strong><span>{item.category || 'Categoria não informada'}</span></div><em>{item.price || 'Sem preço'}</em></div>)}</div> : <div className="erp-empty-data">Nenhum favorito registrado.</div>}</div><div className="panel-box"><div className="panel-header compact"><h3>Atividade recente</h3><TrendingUp size={16} color="#16a34a" /></div><div className="erp-empty-data">A atividade aparecerá aqui quando houver ações registradas.</div></div></div>
    </div>
  );
}
