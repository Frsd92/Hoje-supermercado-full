"use client";

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import {
  Bell,
  BriefcaseBusiness,
  Home,
  MapPin,
  Settings,
  Search,
  ShoppingBag,
  ShoppingCart,
  Minus,
  Plus,
  Trash2,
  Store,
  Sparkles,
  Star,
  UserRound,
  LogOut,
  X,
} from 'lucide-react';

const navItems = [
  { label: 'Início', href: '/dashboard', icon: Home },
  { label: 'Perfil', href: '/dashboard/profile', icon: UserRound },
  { label: 'Endereços', href: '/dashboard/addresses', icon: MapPin },
  { label: 'Favoritos', href: '/dashboard/favorites', icon: Star },
  { label: 'Meus Pedidos', href: '/dashboard/orders', icon: ShoppingBag },
  { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
];

const storeUrl = 'http://localhost:5500/';
const validCoupons = { HOJE10: 0.1, HOJE20: 0.2, PREMIUM: 0.15 };

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const { data: session } = useSession();
  const [search, setSearch] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [checkoutAddress, setCheckoutAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const [coupon, setCoupon] = useState('');
  const [couponStatus, setCouponStatus] = useState('');
  const [checkoutStatus, setCheckoutStatus] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [searchableProducts, setSearchableProducts] = useState([]);
  const [notificationCount, setNotificationCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  useEffect(() => {
    const updateCartCount = async () => {
      try {
        const response = await fetch('/api/cart');
        if (!response.ok) throw new Error('Carrinho indisponível');
        const { cart = [] } = await response.json();
        setCartItems(cart);
        setCartCount(cart.reduce((total, item) => total + (item.quantity || 1), 0));
      } catch {
        setCartItems([]);
        setCartCount(0);
      }
    };

    updateCartCount();
    const cartInterval = window.setInterval(updateCartCount, 3000);
    fetch('/api/products').then((response) => response.json()).then(({ products = [] }) => setSearchableProducts(products)).catch(() => setSearchableProducts([]));
    window.addEventListener('dashboard-cart-updated', updateCartCount);
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.topbar-search input')?.focus();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => {
      window.clearInterval(cartInterval);
      window.removeEventListener('keydown', handleShortcut);
      window.removeEventListener('dashboard-cart-updated', updateCartCount);
    };
  }, [session?.user?.email]);

  const saveCart = async (nextCart) => {
    setCartItems(nextCart);
    setCartCount(nextCart.reduce((total, item) => total + (item.quantity || 1), 0));
    try {
      await fetch('/api/cart', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: nextCart }),
      });
      window.dispatchEvent(new Event('dashboard-cart-updated'));
    } catch {
      setCheckoutStatus('Não foi possível atualizar o carrinho.');
    }
  };

  const addToCart = (product) => {
    const price = Number(product.salePrice ?? product.price ?? 0);
    const existing = cartItems.find((item) => item.productId === product.id || item.name === product.title);
    const nextCart = existing
      ? cartItems.map((item) => item === existing ? { ...item, quantity: (item.quantity || 1) + 1 } : item)
      : [...cartItems, { productId: product.id, name: product.title, category: product.categories?.[0] || '', price: `R$ ${price.toFixed(2).replace('.', ',')}`, image: product.image || '', quantity: 1 }];
    saveCart(nextCart);
    setCheckoutStatus(`${product.title} foi adicionado ao carrinho.`);
    setSearchFocused(false);
    setSearch('');
  };

  const changeCartQuantity = (item, delta) => {
    const nextCart = cartItems
      .map((current) => current === item ? { ...current, quantity: (current.quantity || 1) + delta } : current)
      .filter((current) => current.quantity > 0);
    saveCart(nextCart);
  };

  const finishPurchase = async (event) => {
    event.preventDefault();
    if (!cartItems.length) return setCheckoutStatus('Adicione produtos antes de finalizar.');
    if (!checkoutAddress.trim()) return setCheckoutStatus('Informe o endereço de entrega.');
    setCheckoutLoading(true);
    setCheckoutStatus('');
    const subtotal = cartItems.reduce((sum, item) => sum + (Number(String(item.price || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0) * (item.quantity || 1), 0);
    const discount = subtotal * (validCoupons[coupon.trim().toUpperCase()] || 0);
    const total = subtotal - discount;
    try {
      const response = await fetch('/api/erp/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: cartItems, address: checkoutAddress.trim(), paymentMethod, total: `R$ ${total.toFixed(2).replace('.', ',')}` }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível finalizar a compra.');
      await saveCart([]);
      setCheckoutAddress('');
      setPaymentMethod('pix');
      setCoupon('');
      setCouponStatus('');
      setCheckoutStatus(`Pedido ${data.order.id} realizado com sucesso.`);
    } catch (error) {
      setCheckoutStatus(error.message);
    } finally {
      setCheckoutLoading(false);
    }
  };

  useEffect(() => {
    if (!session?.user?.email) return undefined;
    let active = true;
    const seenKey = `hoje-notifications-seen-${session.user.email}`;
    const deliveredKey = `hoje-notifications-delivered-${session.user.email}`;
    const loadNotifications = async () => {
      try {
        const preferences = JSON.parse(localStorage.getItem('dashboard-settings') || '{}');
        const response = await fetch('/api/notifications');
        if (!response.ok) return;
        const { notifications: savedNotifications = [] } = await response.json();
        if (!active) return;
        const seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
        const delivered = JSON.parse(localStorage.getItem(deliveredKey) || '[]');
        const visibleNotifications = savedNotifications.filter((notification) => {
          if (notification.type === 'promotion' && preferences.promotions === false) return false;
          if (notification.type === 'order' && preferences.orderStatus === false) return false;
          return true;
        });
        setNotifications(visibleNotifications);
        const unseen = visibleNotifications.filter((notification) => {
          if (seen.includes(notification.id)) return false;
          if (notification.type === 'promotion' && preferences.promotions === false) return false;
          if (notification.type === 'order' && preferences.orderStatus === false) return false;
          return true;
        });
        setNotificationCount(unseen.length);
        const pendingDelivery = unseen.filter((notification) => !delivered.includes(notification.id));
        if (preferences.pushNotifications !== false && pendingDelivery.length && 'Notification' in window && Notification.permission === 'granted') {
          pendingDelivery.slice(0, 3).forEach((notification) => {
            const browserNotification = new Notification(notification.title, { body: notification.message, icon: '/logo-hj.webp', tag: notification.id });
            browserNotification.onclick = () => {
              const currentSeen = JSON.parse(localStorage.getItem(seenKey) || '[]');
              localStorage.setItem(seenKey, JSON.stringify([...new Set([...currentSeen, notification.id])].slice(-100)));
              window.focus();
              window.dispatchEvent(new Event('dashboard-notifications-updated'));
              browserNotification.close();
            };
          });
          localStorage.setItem(deliveredKey, JSON.stringify([...new Set([...delivered, ...pendingDelivery.map((notification) => notification.id)])].slice(-100)));
        }
      } catch {
        if (active) setNotificationCount(0);
      }
    };
    loadNotifications();
    const interval = window.setInterval(loadNotifications, 10000);
    window.addEventListener('dashboard-settings-updated', loadNotifications);
    window.addEventListener('dashboard-notifications-updated', loadNotifications);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('dashboard-settings-updated', loadNotifications); window.removeEventListener('dashboard-notifications-updated', loadNotifications); };
  }, [session?.user?.email]);

  const enableNotifications = async () => {
    if (!('Notification' in window)) return;
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      const preferences = JSON.parse(localStorage.getItem('dashboard-settings') || '{}');
      localStorage.setItem('dashboard-settings', JSON.stringify({ ...preferences, pushNotifications: true }));
      window.dispatchEvent(new Event('dashboard-settings-updated'));
    }
  };

  const markNotificationRead = (notificationId) => {
    if (!session?.user?.email) return;
    const seenKey = `hoje-notifications-seen-${session.user.email}`;
    const seen = JSON.parse(localStorage.getItem(seenKey) || '[]');
    localStorage.setItem(seenKey, JSON.stringify([...new Set([...seen, notificationId])].slice(-100)));
    window.dispatchEvent(new Event('dashboard-notifications-updated'));
  };

  const initials = session?.user?.name
    ?.split(' ')
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase() || 'U';

  return (
    <div className="dashboard-shell">
      <aside className="sidebar">
        <div>
          <div className="brand-wrap">
            <div className="brand-mark">
              <img src="/logo-hj.webp" alt="Hoje Supermercado" />
            </div>
            <div>
              <p className="brand-kicker">Cliente</p>
              <h2>Hoje Supermercado</h2>
            </div>
          </div>

          <nav className="sidebar-nav">
            {navItems.map(({ label, href, icon: Icon }) => {
              const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

              return (
                <Link key={label} href={href} className={`sidebar-item ${active ? 'active' : ''}`}>
                  <Icon size={18} />
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="sidebar-footer">
          <a className="store-return-link" href={storeUrl}>
            <Store size={16} />
            <span>Voltar para a loja</span>
          </a>

          <div className="user-mini">
            <div className="avatar">{initials}</div>
            <div>
              <strong>{session?.user?.name || 'Usuário Google'}</strong>
              <span>{session?.user?.email || 'usuario@gmail.com'}</span>
            </div>
          </div>

          <button className="signout-btn" onClick={() => signOut({ callbackUrl: '/login' })}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
              <LogOut size={16} />
              Sair
            </span>
          </button>
        </div>
      </aside>

      <main className="content">
        <header className="topbar">
          <div className="left">
            <div className="topbar-search-wrap">
              <div className={`topbar-search ${searchFocused ? 'is-focused' : ''}`}>
                <Search size={17} className="search-icon" />
                <input
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => window.setTimeout(() => setSearchFocused(false), 120)}
                  placeholder="Buscar produtos, categorias e ofertas"
                  aria-label="Buscar"
                />
                {search ? (
                  <button type="button" className="search-clear" aria-label="Limpar busca" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearch('')}>
                    <X size={15} />
                  </button>
                ) : <kbd>Ctrl K</kbd>}

                {searchFocused && (
                  <div className="search-suggestions">
                    {search ? (
                      <>
                        <span className="search-suggestions-label">Produtos encontrados</span>
                        {searchableProducts
                          .filter((product) => `${product.title} ${product.categories?.join(' ') || ''}`.toLowerCase().includes(search.toLowerCase()))
                          .slice(0, 5)
                          .map((product) => (
                            <div key={product.id} className="dashboard-search-product">
                              <span className="dashboard-search-product-info">
                                <strong>{product.title}</strong>
                                <small>{product.categories?.join(', ')} · R$ {Number(product.price).toFixed(2).replace('.', ',')}</small>
                              </span>
                              <button className="dashboard-search-buy" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addToCart(product)}>
                                <Plus size={13} /> Adicionar
                              </button>
                            </div>
                          ))}
                        {!searchableProducts.some((product) => `${product.title} ${product.categories?.join(' ') || ''}`.toLowerCase().includes(search.toLowerCase())) && (
                          <span className="search-suggestions-empty">Nenhum produto encontrado.</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="search-suggestions-label">Sugestões rápidas</span>
                        {searchableProducts.slice(0, 4).map((product) => (
                          <button key={product.id} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearch(product.title)}>
                            <Search size={14} />
                            {product.title}
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                )}
              </div>

            </div>

            <div className="top-icons">
              <button className="dashboard-cart-button" type="button" aria-label={`Carrinho com ${cartCount} itens`} onClick={() => { setCartOpen(true); setCheckoutStatus(''); }}>
                <ShoppingCart size={18} />
                <span className="dashboard-cart-count">{cartCount}</span>
              </button>
              <button className="icon-button" aria-label="Favoritos">
                <Star size={18} />
              </button>
              <button className="icon-button notification-button" aria-label="Abrir notificações" onClick={() => setNotificationsOpen((current) => !current)}>
                <Bell size={18} />
                {notificationCount > 0 && <span className="notification-count">{notificationCount > 9 ? '9+' : notificationCount}</span>}
              </button>
              {notificationsOpen && <div className="notification-inbox"><div className="notification-inbox-header"><div><strong>Notificações</strong><small>{notificationCount ? `${notificationCount} não lida(s)` : 'Tudo em dia'}</small></div><button type="button" aria-label="Fechar notificações" onClick={() => setNotificationsOpen(false)}><X size={15} /></button></div>{notifications.length ? <div className="notification-inbox-list">{notifications.map((notification) => { const seen = JSON.parse(localStorage.getItem(`hoje-notifications-seen-${session?.user?.email}`) || '[]').includes(notification.id); return <button type="button" key={notification.id} className={`notification-inbox-item ${seen ? 'is-read' : 'is-unread'}`} onClick={() => markNotificationRead(notification.id)}><span className="notification-inbox-dot" /><span><strong>{notification.title}</strong><small>{notification.message}</small><em>{notification.durationDays ? `${notification.durationDays} dias` : 'Mensagem ativa'}</em></span></button>; })}</div> : <div className="notification-inbox-empty"><Bell size={20} /><span>Nenhuma mensagem disponível.</span></div>}</div>}
              <button className="icon-button" aria-label="Área de trabalho">
                <BriefcaseBusiness size={18} />
              </button>
              <button className="icon-button" aria-label="Sparkles">
                <Sparkles size={18} />
              </button>
            </div>
          </div>

          <div className="right">
            <a className="topbar-store-link" href={storeUrl}>
              <Store size={16} />
              <span>Loja</span>
            </a>
          </div>
        </header>

        <div className="page-container dashboard-page">
          {children}
        </div>
      </main>

      {cartOpen && <div className="cart-backdrop open" onMouseDown={() => setCartOpen(false)}>
        <aside className="cart-panel open" onMouseDown={(event) => event.stopPropagation()}>
          <div className="cart-panel-header"><div className="cart-panel-title-wrap"><span className="cart-panel-icon"><ShoppingCart size={18} /></span><h3 id="cart-panel-title">Meu Carrinho ({cartItems.reduce((total, item) => total + (item.quantity || 1), 0)} {cartItems.reduce((total, item) => total + (item.quantity || 1), 0) === 1 ? 'item' : 'itens'})</h3></div><button type="button" className="cart-close" aria-label="Fechar carrinho" onClick={() => setCartOpen(false)}>×</button></div>
          <p className="cart-subtitle">Revise seus itens antes de finalizar</p>
          <div className="cart-items">{cartItems.length ? cartItems.map((item) => <div className="cart-item" key={item.productId || item.name}><div className="cart-item-thumb">{item.image ? <img src={item.image} alt={item.name} /> : <div className="cart-thumb-placeholder" />}</div><div className="cart-item-info"><div className="cart-item-name">{item.name}</div><div className="cart-item-category">{item.category || 'Produtos'}</div><div className="cart-item-price">{item.price}</div></div><div className="cart-item-controls"><button type="button" aria-label={`Diminuir quantidade de ${item.name}`} onClick={() => changeCartQuantity(item, -1)}><Minus size={16} /></button><span className="cart-item-qty">{item.quantity || 1}</span><button type="button" aria-label={`Aumentar quantidade de ${item.name}`} onClick={() => changeCartQuantity(item, 1)}><Plus size={16} /></button></div><button type="button" className="cart-item-remove" aria-label={`Remover ${item.name}`} onClick={() => saveCart(cartItems.filter((current) => current !== item))}><Trash2 size={16} /></button></div>) : <div className="cart-empty"><ShoppingCart size={28} /><strong>Seu carrinho está vazio</strong></div>}</div>
          <form className="cart-panel-footer" onSubmit={finishPurchase}><div className="cart-summary-box"><div className="summary-row"><span>Subtotal ({cartItems.reduce((total, item) => total + (item.quantity || 1), 0)} itens)</span><strong>R$ {cartItems.reduce((sum, item) => sum + (Number(String(item.price || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0) * (item.quantity || 1), 0).toFixed(2).replace('.', ',')}</strong></div><div className="summary-row"><span>Descontos</span><strong>R$ {(cartItems.reduce((sum, item) => sum + (Number(String(item.price || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0) * (item.quantity || 1), 0) * (validCoupons[coupon.trim().toUpperCase()] || 0)).toFixed(2).replace('.', ',')}</strong></div><div className="summary-row"><span>Frete</span><strong>R$ 0,00</strong></div><div className="summary-row total"><span>Total</span><strong>R$ {(cartItems.reduce((sum, item) => sum + (Number(String(item.price || '').replace(/[^0-9,]/g, '').replace(',', '.')) || 0) * (item.quantity || 1), 0) * (1 - (validCoupons[coupon.trim().toUpperCase()] || 0))).toFixed(2).replace('.', ',')}</strong></div></div><div className="cart-coupon"><input value={coupon} onChange={(event) => setCoupon(event.target.value)} placeholder="Cupom: HOJE10" maxLength={20} /><button className="btn-coupon" type="button" onClick={() => setCouponStatus(validCoupons[coupon.trim().toUpperCase()] ? `Cupom ${coupon.trim().toUpperCase()} aplicado com sucesso!` : 'Cupom inválido. Tente: HOJE10, HOJE20 ou PREMIUM')}>Aplicar</button></div><p className={`coupon-feedback ${couponStatus.includes('sucesso') ? 'success' : couponStatus ? 'error' : ''}`}>{couponStatus}</p><label className="delivery-address-field">Endereço de entrega<select value={checkoutAddress} onChange={(event) => setCheckoutAddress(event.target.value)}><option value="">Selecione seu endereço</option><option value="Casa | Rua das Flores, 123 - Apto 45 | Centro, São Paulo - SP">Casa · Rua das Flores, 123</option><option value="Trabalho | Av. Paulista, 1000 | Bela Vista, São Paulo - SP">Trabalho · Av. Paulista, 1000</option></select></label><button className="btn-finalizar" type="submit" disabled={checkoutLoading || !cartItems.length}>{checkoutLoading ? 'Finalizando...' : 'Finalizar Compra'}</button><button type="button" className="btn-limpar" onClick={() => saveCart([])}>Limpar Carrinho</button>{checkoutStatus && <p className={`coupon-feedback ${checkoutStatus.includes('sucesso') ? 'success' : 'error'}`}>{checkoutStatus}</p>}</form>
        </aside>
      </div>}
    </div>
  );
}
