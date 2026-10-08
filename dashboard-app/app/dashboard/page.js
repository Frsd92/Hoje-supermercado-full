'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Award, ArrowRight, CircleDollarSign, CreditCard, Gift, Heart, MapPin, Package, ShoppingCart, UserRound } from 'lucide-react';
import CustomerMissionCard from '@/features/loyalty/customer-mission-card';
import { formatCurrency, getBudgetProgress, getCurrentMonthSpend } from './budget';
import { readLocalBudget } from './budget-storage';
import { getCartItemCount } from './cart-utils';
import { syncFavoritesWithCatalog } from './favorite-utils';
import { getOrderStatus } from './order-status';

export default function DashboardHomePage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [favorites, setFavorites] = useState([]);
  const [failedFavoriteImages, setFailedFavoriteImages] = useState({});
  const [orders, setOrders] = useState([]);
  const [cart, setCart] = useState([]);
  const [profile, setProfile] = useState({ monthlyBudget: 0, photo: null, googlePhoto: '' });
  const [deliveryAddress, setDeliveryAddress] = useState(null);
  const [dashboardLoading, setDashboardLoading] = useState(true);
  const [dashboardError, setDashboardError] = useState(false);
  const [dashboardRetry, setDashboardRetry] = useState(0);
  const [loyaltyMissions, setLoyaltyMissions] = useState([]);
  const [loyaltyRewards, setLoyaltyRewards] = useState([]);
  const [loyaltyBalance, setLoyaltyBalance] = useState(0);
  const [loyaltyLoading, setLoyaltyLoading] = useState(true);
  const [loyaltyError, setLoyaltyError] = useState(false);
  const [loyaltyRetry, setLoyaltyRetry] = useState(0);
  const [deliveryAddressLoading, setDeliveryAddressLoading] = useState(true);
  const [deliveryAddressError, setDeliveryAddressError] = useState(false);
  const [addressRetry, setAddressRetry] = useState(0);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const loadJson = async (url, fallbackMessage) => {
      const response = await fetch(url, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || fallbackMessage);
      return data;
    };

    const loadDashboard = async () => {
      setDashboardLoading(true);
      setDashboardError(false);
      try {
        const [favoriteData, orderData, profileData] = await Promise.all([
          loadJson('/api/favorites', 'Não foi possível carregar seus favoritos.'),
          loadJson('/api/my/orders', 'Não foi possível carregar seus pedidos.'),
          loadJson('/api/profile', 'Não foi possível carregar seu perfil.'),
        ]);
        if (!Array.isArray(favoriteData.favorites) || !Array.isArray(orderData.orders)) {
          throw new Error('Resposta inválida dos dados do painel.');
        }
        if (!active) return;

        setFavorites(favoriteData.favorites);
        setOrders(orderData.orders);
        setProfile({
          ...(profileData.profile || { monthlyBudget: 0, photo: null, googlePhoto: '' }),
          monthlyBudget: readLocalBudget(session?.user?.email) ?? profileData.profile?.monthlyBudget ?? 0,
        });

        loadJson('/api/products', 'Catálogo indisponível.')
          .then((catalog) => {
            if (!Array.isArray(catalog.products)) throw new Error('Resposta inválida do catálogo.');
            if (active) setFavorites((currentFavorites) => syncFavoritesWithCatalog(currentFavorites, catalog.products));
          })
          .catch((error) => {
            if (!active) return;
            console.error('Não foi possível atualizar os dados dos produtos favoritos:', error);
            setDashboardError(true);
          });
      } catch (error) {
        if (!active) return;
        console.error('Não foi possível carregar os dados do painel do cliente:', error);
        setDashboardError(true);
      } finally {
        if (active) setDashboardLoading(false);
      }
    };

    loadDashboard();
    return () => {
      active = false;
    };
  }, [status, session?.user?.email, dashboardRetry]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    let active = true;
    const loadMissions = async () => {
      setLoyaltyLoading(true);
      setLoyaltyError(false);
      try {
        const response = await fetch('/api/loyalty', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar suas missões.');
        if (!Array.isArray(data.missions) || !Array.isArray(data.rewards)) {
          throw new Error('Resposta inválida das missões e recompensas.');
        }
        if (active) {
          setLoyaltyMissions(data.missions);
          setLoyaltyRewards(data.rewards);
          const balance = Number(data.balance);
          setLoyaltyBalance(Number.isFinite(balance) ? balance : 0);
        }
      } catch (error) {
        if (!active) return;
        console.error('Não foi possível carregar missões e recompensas no resumo do painel:', error);
        setLoyaltyError(true);
      } finally {
        if (active) setLoyaltyLoading(false);
      }
    };
    void loadMissions();
    return () => {
      active = false;
    };
  }, [status, session?.user?.email, loyaltyRetry]);

  useEffect(() => {
    if (status !== 'authenticated') return;
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
    const loadDeliveryAddress = async (preferredId = localStorage.getItem(storageKey)) => {
      setDeliveryAddressLoading(true);
      setDeliveryAddressError(false);
      try {
        const response = await fetch('/api/addresses', { cache: 'no-store' });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o endereço de entrega.');
        if (!Array.isArray(data.addresses)) throw new Error('Resposta inválida dos endereços.');
        if (!active) return;
        const selected = data.addresses.find((address) => String(address.id) === preferredId)
          || data.addresses.find((address) => address.type === 'Padrão')
          || data.addresses[0]
          || null;
        setDeliveryAddress(selected);
      } catch (error) {
        if (!active) return;
        console.error('Não foi possível carregar o endereço de entrega do painel:', error);
        setDeliveryAddress(null);
        setDeliveryAddressError(true);
      } finally {
        if (active) setDeliveryAddressLoading(false);
      }
    };
    loadDeliveryAddress();
    const handleAddressSelected = (event) => {
      const selectedId = event.detail?.addressId || localStorage.getItem(storageKey);
      loadDeliveryAddress(selectedId);
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
  }, [status, session?.user?.email, addressRetry]);

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
  const availableMissions = loyaltyMissions.filter((mission) => !mission.completedAt && !mission.soldOut);
  const visibleMissions = (availableMissions.length ? availableMissions : loyaltyMissions).slice(0, 3);
  const visibleRewards = loyaltyRewards.slice(0, 2);
  const metricData = [
    { label: 'Pedidos realizados', value: dashboardLoading ? '—' : orders.length, detail: dashboardLoading ? 'Atualizando pedidos' : 'pedidos registrados', Icon: Package },
    { label: 'Orçamento do mês', value: dashboardLoading ? '—' : profile.monthlyBudget ? formatCurrency(profile.monthlyBudget) : 'Não definido', detail: dashboardLoading ? 'Atualizando orçamento' : `${formatCurrency(monthSpend)} gastos neste mês`, Icon: CircleDollarSign, budget: true },
    { label: 'Produtos favoritos', value: dashboardLoading ? '—' : favorites.length, detail: dashboardLoading ? 'Atualizando favoritos' : 'itens salvos', Icon: Heart },
    { label: 'Itens no carrinho', value: cartCount, detail: 'itens atuais', Icon: ShoppingCart },
  ];
  const deliveryAddressDetails = deliveryAddress
    ? [
      [deliveryAddress.street, deliveryAddress.number].filter(Boolean).join(', '),
      deliveryAddress.neighborhood,
      deliveryAddress.city,
      deliveryAddress.state,
    ].filter(Boolean).join(' · ')
    : '';

  return (
    <div className="page-section dashboard-home">
      {dashboardError && (
        <div className="dashboard-data-alert" role="alert">
          <span>Algumas informações não puderam ser atualizadas.</span>
          <button type="button" onClick={() => setDashboardRetry((attempt) => attempt + 1)}>Tentar novamente</button>
        </div>
      )}
      <section className="dashboard-hero">
        <div className="hero-copy">
          <span className="eyebrow">Painel do cliente</span>
          <h1>Olá, {(profile.fullName || session.user?.name || 'cliente').split(' ')[0]}!</h1>
          <p>Organize sua próxima compra, acompanhe pedidos e encontre tudo da sua conta em um só lugar.</p>
          <div className="hero-actions">
            <Link href="/dashboard/orders" className="secondary-cta">Acompanhar pedidos</Link>
          </div>
        </div>
        <div className="hero-card">
          <div className="hero-card-label"><MapPin size={16} /><span>Endereço de entrega</span></div>
          <div className="hero-card-value hero-card-address">
            {deliveryAddressLoading ? 'Carregando endereço' : deliveryAddress?.title || (deliveryAddress ? 'Endereço salvo' : 'Defina onde receber')}
          </div>
          <div className="hero-card-sub">
            {deliveryAddressLoading
              ? 'Buscando seus endereços salvos…'
              : deliveryAddress
                ? deliveryAddressDetails || 'Endereço selecionado para suas compras.'
                : deliveryAddressError
                  ? 'Não foi possível consultar seus endereços.'
                  : 'Adicione um endereço para agilizar a entrega das compras.'}
          </div>
          {deliveryAddressError && (
            <button className="hero-card-action" type="button" onClick={() => setAddressRetry((attempt) => attempt + 1)}>
              Tentar novamente <ArrowRight size={15} />
            </button>
          )}
          <Link className="hero-card-action" href="/dashboard/addresses">
            {deliveryAddress ? 'Gerenciar endereço' : 'Adicionar endereço'} <ArrowRight size={15} />
          </Link>
        </div>
      </section>

      <div className="stats-panel-home">{metricData.map(({ label, value, detail, Icon, budget }) => {
        const isCartCard = label === 'Itens no carrinho';
        const cardClassName = `metric-mini ${budget ? 'budget-metric' : ''}${isCartCard ? ' cart-metric-clickable' : ' metric-mini-link'}`;
        const cardContent = <>
          <div className="metric-mini-icon"><Icon size={18} /></div>
          <div className="metric-mini-value">{value}</div>
          <div className="metric-mini-label">{label}</div>
          <div className="metric-mini-detail">{detail}</div>
          {budget && !dashboardLoading && profile.monthlyBudget > 0 && <div className="budget-meter" role="progressbar" aria-label="Uso do orçamento mensal" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(budgetProgress)}><span className={budgetProgress >= 80 ? 'near-limit' : ''} style={{ width: `${budgetProgress}%` }} /></div>}
          {budget && !dashboardLoading && <span className="budget-edit-link">{profile.monthlyBudget > 0 ? 'Ver orçamento' : 'Definir orçamento'}</span>}
        </>;
        if (isCartCard) {
          return <button key={label} type="button" className={cardClassName} aria-label={`Abrir carrinho com ${cartCount} itens`} onClick={() => window.dispatchEvent(new Event('dashboard-open-cart'))}>{cardContent}</button>;
        }
        const href = budget ? '/dashboard/budget'
          : label === 'Pedidos realizados' ? '/dashboard/orders'
            : '/dashboard/favorites';
        return <Link key={label} href={href} className={cardClassName}>{cardContent}</Link>;
      })}</div>

      <section className="panel-box customer-coupons-showcase dashboard-home-loyalty" aria-labelledby="dashboard-loyalty-heading">
        <div className="panel-header compact">
          <div className="dashboard-home-loyalty-heading">
            <Award size={19} aria-hidden="true" />
            <div><h3 id="dashboard-loyalty-heading">Missões e pontos</h3><p>Complete desafios, ganhe pontos e troque por recompensas.</p></div>
          </div>
          <Link href="/dashboard/fidelidade" className="dashboard-panel-link">Ver todas <ArrowRight size={14} aria-hidden="true" /></Link>
        </div>
        {loyaltyLoading
          ? <div className="dashboard-home-empty" role="status">Carregando missões e recompensas...</div>
          : loyaltyError
            ? <div className="dashboard-home-empty" role="alert">
              <span>Não foi possível carregar suas missões e recompensas.</span>
              <button className="dashboard-mission-retry" type="button" onClick={() => setLoyaltyRetry((attempt) => attempt + 1)}>Tentar novamente</button>
            </div>
            : <div className="dashboard-home-loyalty-content">
              {visibleMissions.length
                ? <div className="loyalty-card-grid loyalty-mission-grid dashboard-home-mission-grid">
                  {visibleMissions.map((mission) => <CustomerMissionCard key={mission.id} mission={mission} compact />)}
                </div>
                : <div className="dashboard-home-empty" role="status">Nenhuma missão ativa no momento. Novos desafios aparecerão aqui.</div>}
              <div className="dashboard-home-reward-section">
                <div className="dashboard-home-loyalty-subheading">
                  <h4>Recompensas disponíveis</h4>
                  <span>{loyaltyRewards.length}</span>
                </div>
                {visibleRewards.length
                  ? <div className="loyalty-card-grid dashboard-home-reward-grid">
                    {visibleRewards.map((reward) => {
                      const pointsCost = Number(reward.pointsCost) || 0;
                      const pointsNeeded = Math.max(0, pointsCost - loyaltyBalance);
                      return <article className="customer-coupon-card loyalty-reward-card" key={reward.id}>
                        <div className="customer-coupon-card-heading">
                          <span><Gift size={15} aria-hidden="true" />Recompensa</span>
                          <strong>{reward.discountPercent}% OFF</strong>
                        </div>
                        <h5>{reward.name}</h5>
                        <p className="dashboard-home-reward-cost">
                          Custa <strong>{pointsCost.toLocaleString('pt-BR')} pontos</strong>
                          {pointsNeeded > 0 ? ` · faltam ${pointsNeeded.toLocaleString('pt-BR')} pontos` : ' · disponível para resgatar'}
                        </p>
                        <dl className="customer-coupon-dates">
                          <div><dt>Pedido mínimo</dt><dd>{formatCurrency(Number(reward.minimumOrderAmount) || 0)}</dd></div>
                        </dl>
                        <Link className="dashboard-home-reward-link" href="/dashboard/fidelidade#loyalty-rewards">
                          Ver recompensa <ArrowRight size={14} aria-hidden="true" />
                        </Link>
                      </article>;
                    })}
                  </div>
                  : <div className="dashboard-home-empty" role="status">Nenhuma recompensa disponível no momento.</div>}
              </div>
            </div>}
      </section>

      <div className="home-grid">
        <div className="panel-box profile-panel">
          <div className="panel-header compact"><h3>Resumo do perfil</h3><Link href="/dashboard/profile" className="dashboard-panel-link">Editar perfil</Link></div>
          <div className="profile-preview"><div className="avatar-large">{profile.photo || profile.googlePhoto || session.user?.image ? <img src={profile.photo || profile.googlePhoto || session.user?.image} alt="" /> : session.user?.name?.[0]?.toUpperCase() || 'U'}</div><div><strong>{profile.fullName || session.user?.name || 'Cliente'}</strong><span>{session.user?.email || 'E-mail não informado'}</span></div></div>
          <div className="profile-detail-grid"><div><label>Localização</label><strong>{deliveryAddress?.city || deliveryAddress?.street || 'Sem endereço'}</strong></div><div><label>Entrega</label><strong>{deliveryAddress?.title || 'Não selecionada'}</strong></div><div><label>Orçamento mensal</label><strong>{profile.monthlyBudget ? formatCurrency(profile.monthlyBudget) : 'Não definido'}</strong></div></div>
        </div>
        <div className="panel-box">
          <div className="panel-header compact"><h3>Últimos pedidos</h3><Link href="/dashboard/orders" className="dashboard-panel-link">Ver todos</Link></div>
          {orders.length ? <ul className="mini-list">{orders.slice(0, 4).map((order) => { const info = getOrderStatus(order.status); return <li key={order.id}><span>{order.id}</span><strong className={`mini-order-status ${info.tone}`}><span className="order-status-light" />{info.label}</strong><em>{order.total}</em></li>; })}</ul> : <div className="dashboard-home-empty"><span>{dashboardLoading ? 'Carregando seus pedidos…' : dashboardError ? 'Pedidos indisponíveis no momento.' : 'Você ainda não fez um pedido.'}</span>{!dashboardLoading && !dashboardError && <Link href="/">Escolher produtos</Link>}</div>}
        </div>
      </div>

      <div className="bottom-grid">
        <div className="panel-box">
          <div className="panel-header compact"><h3>Produtos favoritos</h3><Link href="/dashboard/favorites" className="dashboard-panel-link">Ver todos</Link></div>
          {favorites.length ? <div className="favorites-mini-list">{favorites.slice(0, 5).map((item) => {
            const imageKey = String(item.productId || item.id || item.name);
            const hasImage = item.image && !failedFavoriteImages[imageKey];
            return <div key={item.name} className="favorite-mini-row">
              <div className="favorite-mini-icon">
                {hasImage
                  ? <img src={item.image} alt="" loading="lazy" onError={() => setFailedFavoriteImages((current) => ({ ...current, [imageKey]: true }))} />
                  : <Package size={17} aria-hidden="true" />}
              </div>
              <div><strong>{item.name}</strong><span>{item.category || 'Categoria não informada'}</span></div>
              <em>{item.price || 'Sem preço'}</em>
            </div>;
          })}</div> : <div className="dashboard-home-empty"><span>{dashboardLoading ? 'Carregando seus favoritos…' : dashboardError ? 'Favoritos indisponíveis no momento.' : 'Salve produtos para encontrá-los aqui.'}</span>{!dashboardLoading && !dashboardError && <Link href="/dashboard/favorites">Ver meus favoritos</Link>}</div>}
        </div>
        <div className="panel-box">
          <div className="panel-header compact"><h3>Atalhos da conta</h3></div>
          <div className="dashboard-quick-links">
            <Link href="/dashboard/addresses"><span className="quick-link-icon"><MapPin size={17} /></span><span><strong>Endereços</strong><small>Gerencie onde receber</small></span><ArrowRight size={16} /></Link>
            <Link href="/dashboard/payment-methods"><span className="quick-link-icon"><CreditCard size={17} /></span><span><strong>Formas de pagamento</strong><small>Escolha como pagar</small></span><ArrowRight size={16} /></Link>
            <Link href="/dashboard/profile"><span className="quick-link-icon"><UserRound size={17} /></span><span><strong>Meu perfil</strong><small>Mantenha seus dados atualizados</small></span><ArrowRight size={16} /></Link>
          </div>
        </div>
      </div>
    </div>
  );
}
