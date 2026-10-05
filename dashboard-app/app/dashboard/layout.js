"use client";

import Link from 'next/link';
import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { signOut, useSession } from 'next-auth/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { adjustCartQuantity, formatCartQuantity, getCartItemCount, normalizeCartItems } from './cart-utils';
import { calculateOrderTotals } from '@/features/orders/order-receipt-data';
import contentModeration from '@/lib/content-moderation.js';
import {
  DEFAULT_PAYMENT_METHOD,
  PAYMENT_METHODS,
  PAYMENT_METHOD_UPDATED_EVENT,
  isPaymentMethod,
  readPaymentMethod,
  savePaymentMethod,
} from './payment-methods';
import {
  Bell,
  ChevronDown,
  CircleDollarSign,
  CreditCard,
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
  Sun,
  Moon,
  Star,
  UserRound,
  LogOut,
  X,
  Menu,
  TicketPercent,
} from 'lucide-react';

const navigationGroups = [
  {
    label: 'Visão geral',
    items: [{ label: 'Início', href: '/dashboard', icon: Home }],
  },
  {
    label: 'Minhas compras',
    items: [
      { label: 'Meus Pedidos', href: '/dashboard/orders', icon: ShoppingBag },
      { label: 'Meus cupons', href: '/dashboard/cupons', icon: TicketPercent },
      { label: 'Favoritos', href: '/dashboard/favorites', icon: Star },
      { label: 'Orçamento', href: '/dashboard/budget', icon: CircleDollarSign },
    ],
  },
  {
    label: 'Minha conta',
    items: [
      { label: 'Perfil', href: '/dashboard/profile', icon: UserRound },
      { label: 'Endereços', href: '/dashboard/addresses', icon: MapPin },
      { label: 'Formas de pagamento', href: '/dashboard/payment-methods', icon: CreditCard },
      { label: 'Configurações', href: '/dashboard/settings', icon: Settings },
    ],
  },
];

const deliveryAddressStorageKey = (email) => `hoje-dashboard-delivery-address-${email || 'guest'}`;
const getAddressStreet = (address) => [address?.street, address?.number].filter(Boolean).join(', ');

function getAddressValue(address) {
  return `${address.title || 'Endereço'} | ${[
    getAddressStreet(address), address.neighborhood, address.city, address.state, address.country,
  ].filter(Boolean).join(' | ')}`;
}

function getAddressHeading(address) {
  return [
    getAddressStreet(address),
    address?.city,
  ].filter(Boolean).join(', ') || address?.neighborhood || 'Escolher endereço';
}

export default function DashboardLayout({ children }) {
  const pathname = usePathname();
  const { data: session, status: sessionStatus } = useSession();
  const [search, setSearch] = useState('');
  const [theme, setTheme] = useState('dark');
  const [searchFocused, setSearchFocused] = useState(false);
  const [cartCount, setCartCount] = useState(0);
  const [cartItems, setCartItems] = useState([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressesLoading, setAddressesLoading] = useState(true);
  const [addressLoadError, setAddressLoadError] = useState('');
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [deliveryAddressOpen, setDeliveryAddressOpen] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState(DEFAULT_PAYMENT_METHOD);
  const [cpfNoteDialogOpen, setCpfNoteDialogOpen] = useState(false);
  const [coupon, setCoupon] = useState('');
  const [couponDiscountPercent, setCouponDiscountPercent] = useState(0);
  const [appliedCouponCode, setAppliedCouponCode] = useState('');
  const [couponStatus, setCouponStatus] = useState('');
  const normalizedCoupon = coupon.trim().toUpperCase();
  const validCoupons = appliedCouponCode === normalizedCoupon && normalizedCoupon
    ? { [normalizedCoupon]: couponDiscountPercent / 100 }
    : {};
  const activeCouponDiscountPercent = appliedCouponCode === normalizedCoupon && normalizedCoupon
    ? couponDiscountPercent
    : 0;
  const cartTotals = useMemo(
    () => calculateOrderTotals(cartItems, activeCouponDiscountPercent),
    [cartItems, activeCouponDiscountPercent],
  );
  const [checkoutStatus, setCheckoutStatus] = useState('');
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [searchableProducts, setSearchableProducts] = useState([]);
  const [failedSearchImages, setFailedSearchImages] = useState({});
  const [notificationCount, setNotificationCount] = useState(0);
  const [favoritesCount, setFavoritesCount] = useState(null);
  const [profilePhoto, setProfilePhoto] = useState('');
  const [profileName, setProfileName] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const mobileNavToggleRef = useRef(null);
  const cpfNoteDialogRef = useRef(null);
  const cpfNoteNoButtonRef = useRef(null);
  const cartPanelRef = useRef(null);
  const cartOpenerRef = useRef(null);
  const cartItemsRef = useRef([]);
  const cartWriteQueueRef = useRef(Promise.resolve());
  const savedAddressesRef = useRef([]);
  const searchProductsLoadedRef = useRef(false);
  const openCart = useCallback(() => {
    cartOpenerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setCartOpen(true);
    setCheckoutStatus('');
  }, []);
  const closeCart = useCallback(() => {
    setCartOpen(false);
    window.requestAnimationFrame(() => cartOpenerRef.current?.focus());
  }, []);

  useEffect(() => {
    const handleCouponRequest = (event) => {
      const code = String(event.detail?.code || '').trim().toUpperCase();
      if (!/^[A-Z0-9_-]{3,24}$/.test(code)) {
        openCart();
        setCheckoutStatus('Não foi possível carregar este código de cupom. Confira-o e tente novamente.');
        return;
      }
      setCoupon(code);
      setCouponDiscountPercent(0);
      setAppliedCouponCode('');
      setCouponStatus('');
      setCheckoutStatus('');
      openCart();
      window.requestAnimationFrame(() => document.getElementById('cart-coupon-code')?.focus());
    };
    window.addEventListener('dashboard-use-coupon', handleCouponRequest);
    return () => window.removeEventListener('dashboard-use-coupon', handleCouponRequest);
  }, [openCart]);

  useEffect(() => {
    const dialog = cpfNoteDialogRef.current;
    if (!dialog) return;
    if (cpfNoteDialogOpen && !dialog.open) {
      dialog.showModal();
      cpfNoteNoButtonRef.current?.focus();
    } else if (!cpfNoteDialogOpen && dialog.open) {
      dialog.close();
    }
  }, [cpfNoteDialogOpen]);

  useEffect(() => {
    const accountEmail = session?.user?.email || 'guest';
    const applyStoredMethod = () => {
      try {
        setPaymentMethod(readPaymentMethod(session?.user?.email));
      } catch (error) {
        setCheckoutStatus(`Não foi possível carregar a forma de pagamento salva: ${error.message}`);
      }
    };
    const applyPaymentMethodUpdate = (event) => {
      if (event.detail?.email !== accountEmail || !isPaymentMethod(event.detail?.method)) return;
      setPaymentMethod(event.detail.method);
    };

    applyStoredMethod();
    window.addEventListener(PAYMENT_METHOD_UPDATED_EVENT, applyPaymentMethodUpdate);
    window.addEventListener('storage', applyStoredMethod);
    return () => {
      window.removeEventListener(PAYMENT_METHOD_UPDATED_EVENT, applyPaymentMethodUpdate);
      window.removeEventListener('storage', applyStoredMethod);
    };
  }, [session?.user?.email]);

  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== 'Escape') return;
      setMobileNavOpen(false);
      mobileNavToggleRef.current?.focus();
    };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!cartOpen) return undefined;
    const panel = cartPanelRef.current;
    const closeButton = panel?.querySelector('.cart-close');
    const focusableElements = () => Array.from(panel?.querySelectorAll(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])',
    ) || []).filter((element) => element.getClientRects().length > 0);
    closeButton?.focus();
    const handleDialogKeys = (event) => {
      if (cpfNoteDialogRef.current?.open) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        closeCart();
        return;
      }
      if (event.key !== 'Tab') return;
      const focusable = focusableElements();
      if (!focusable.length) {
        event.preventDefault();
        panel?.focus();
        return;
      }
      const currentIndex = focusable.indexOf(document.activeElement);
      if (event.shiftKey && currentIndex <= 0) {
        event.preventDefault();
        focusable[focusable.length - 1].focus();
      } else if (!event.shiftKey && (currentIndex === focusable.length - 1 || currentIndex === -1)) {
        event.preventDefault();
        focusable[0].focus();
      }
    };
    window.addEventListener('keydown', handleDialogKeys);
    return () => window.removeEventListener('keydown', handleDialogKeys);
  }, [cartOpen, closeCart]);

  useEffect(() => {
    const colorScheme = window.matchMedia('(prefers-color-scheme: light)');
    const applySavedTheme = () => {
      let preference = 'Escuro';
      try {
        const settings = JSON.parse(localStorage.getItem('dashboard-settings') || '{}');
        preference = settings.theme || preference;
      } catch {
        preference = 'Escuro';
      }

      const resolvedTheme = preference === 'Claro'
        ? 'light'
        : preference === 'Automatico'
          ? (colorScheme.matches ? 'light' : 'dark')
          : 'dark';
      setTheme(resolvedTheme);
    };
    const handleColorSchemeChange = () => applySavedTheme();

    applySavedTheme();
    colorScheme.addEventListener('change', handleColorSchemeChange);
    window.addEventListener('dashboard-theme-updated', applySavedTheme);
    window.addEventListener('dashboard-settings-updated', applySavedTheme);
    window.addEventListener('storage', applySavedTheme);
    return () => {
      colorScheme.removeEventListener('change', handleColorSchemeChange);
      window.removeEventListener('dashboard-theme-updated', applySavedTheme);
      window.removeEventListener('dashboard-settings-updated', applySavedTheme);
      window.removeEventListener('storage', applySavedTheme);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const updatePhoto = (profile) => {
      setProfilePhoto(profile?.photo || profile?.googlePhoto || session?.user?.image || '');
      setProfileName(profile?.fullName || session?.user?.name || '');
    };
    fetch('/api/profile', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Não foi possível carregar a foto do perfil.');
        return response.json();
      })
      .then(({ profile }) => {
        if (active) updatePhoto(profile);
      })
      .catch((error) => console.error(error));
    const handleProfileUpdated = (event) => updatePhoto(event.detail);
    window.addEventListener('dashboard-profile-updated', handleProfileUpdated);
    return () => {
      active = false;
      window.removeEventListener('dashboard-profile-updated', handleProfileUpdated);
    };
  }, [session?.user?.image, session?.user?.email]);

  useEffect(() => {
    const addressStorageKey = deliveryAddressStorageKey(session?.user?.email);
    let active = true;
    let latestRequest = 0;

    if (sessionStatus !== 'authenticated' || !session?.user?.email) {
      savedAddressesRef.current = [];
      setSavedAddresses([]);
      setSelectedAddressId('');
      setAddressLoadError('');
      setAddressesLoading(sessionStatus === 'loading');
      return () => {
        active = false;
      };
    }

    const applyAddresses = (addresses) => {
      if (!active || !Array.isArray(addresses)) return;
      savedAddressesRef.current = addresses;
      setSavedAddresses(addresses);
      setAddressLoadError('');
      setAddressesLoading(false);
      let preferredId = localStorage.getItem(addressStorageKey) || '';
      let selectedAddress = addresses.find((address) => String(address.id) === preferredId);
      if (!selectedAddress) {
        selectedAddress = addresses.find((address) => address.type === 'Padrão') || addresses[0];
        preferredId = selectedAddress ? String(selectedAddress.id) : '';
      }
      setSelectedAddressId(preferredId);
      if (preferredId) localStorage.setItem(addressStorageKey, preferredId);
      else localStorage.removeItem(addressStorageKey);
    };
    const loadAddresses = () => {
      const requestId = ++latestRequest;
      setAddressLoadError('');
      setAddressesLoading(true);
      fetch('/api/addresses', { cache: 'no-store' })
        .then(async (response) => {
          const result = await response.json();
          if (!response.ok) throw new Error(result.error || 'Não foi possível carregar os endereços.');
          if (!Array.isArray(result.addresses)) throw new Error('A resposta de endereços é inválida.');
          return result.addresses;
        })
        .then((addresses) => {
          if (active && requestId === latestRequest) applyAddresses(addresses);
        })
        .catch((error) => {
          if (!active || requestId !== latestRequest) return;
          setAddressLoadError(error.message || 'Não foi possível carregar os endereços.');
          setAddressesLoading(false);
          console.error('Não foi possível carregar os endereços de entrega:', error);
        });
    };
    const selectAddress = (addressId) => {
      const selected = savedAddressesRef.current.find((address) => String(address.id) === String(addressId));
      if (!selected) {
        loadAddresses();
        return;
      }
      setSelectedAddressId(String(selected.id));
      localStorage.setItem(addressStorageKey, String(selected.id));
      setDeliveryAddressOpen(false);
    };
    const handleAddressSelected = (event) => {
      if (event.detail?.addressId) {
        selectAddress(event.detail.addressId);
      } else {
        loadAddresses();
      }
    };
    loadAddresses();
    window.addEventListener('dashboard-address-selected', handleAddressSelected);
    return () => {
      active = false;
      window.removeEventListener('dashboard-address-selected', handleAddressSelected);
    };
  }, [sessionStatus, session?.user?.email]);

  useEffect(() => {
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    let active = true;
    let cartRequest = null;
    let refreshAfterCurrentRequest = false;
    const applyCart = (cart) => {
      if (!Array.isArray(cart)) return;
      const normalizedCart = normalizeCartItems(cart);
      cartItemsRef.current = normalizedCart;
      setCartItems(normalizedCart);
      setCartCount(getCartItemCount(normalizedCart));
    };
    const readLocalCart = () => {
      try {
        const storedValue = localStorage.getItem(cartStorageKey);
        return storedValue === null ? null : JSON.parse(storedValue);
      } catch {
        return null;
      }
    };

    const loadCartFromServer = () => {
      if (cartRequest) {
        refreshAfterCurrentRequest = true;
        return cartRequest;
      }

      const localCartAtRequestStart = localStorage.getItem(cartStorageKey);
      cartRequest = fetch('/api/cart', { cache: 'no-store' })
        .then((response) => {
          if (!response.ok) throw new Error('Carrinho indisponível');
          return response.json();
        })
        .then(({ cart = [] }) => {
          if (!active || localStorage.getItem(cartStorageKey) !== localCartAtRequestStart) return;
          const normalizedCart = normalizeCartItems(cart);
          applyCart(normalizedCart);
          localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
          window.dispatchEvent(new CustomEvent('dashboard-cart-updated', { detail: normalizedCart }));
        })
        .catch((error) => {
          if (active) setCheckoutStatus(`Não foi possível atualizar o carrinho salvo: ${error.message}`);
        })
        .finally(() => {
          cartRequest = null;
          const shouldRefresh = refreshAfterCurrentRequest && active && document.visibilityState === 'visible';
          refreshAfterCurrentRequest = false;
          if (shouldRefresh) void loadCartFromServer();
        });
      return cartRequest;
    };

    const localCart = readLocalCart();
    if (Array.isArray(localCart)) {
      const normalizedCart = normalizeCartItems(localCart);
      applyCart(normalizedCart);
      localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
    }
    void loadCartFromServer();

    const handleCartUpdated = (event) => {
      const updatedCart = Array.isArray(event.detail) ? event.detail : readLocalCart();
      if (Array.isArray(updatedCart)) applyCart(updatedCart);
    };
    const refreshCartWhenVisible = () => {
      if (document.visibilityState === 'visible') void loadCartFromServer();
    };

    fetch('/api/favorites', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Não foi possível carregar os favoritos.');
        return response.json();
      })
      .then(({ favorites = [] }) => setFavoritesCount(favorites.length))
      .catch((error) => {
        console.error(error);
        setFavoritesCount(null);
      });
    const handleFavoritesUpdated = (event) => {
      if (Number.isInteger(event.detail)) setFavoritesCount(event.detail);
    };
    window.addEventListener('dashboard-favorites-updated', handleFavoritesUpdated);
    window.addEventListener('dashboard-cart-updated', handleCartUpdated);
    window.addEventListener('pageshow', refreshCartWhenVisible);
    document.addEventListener('visibilitychange', refreshCartWhenVisible);
    const handleOpenCart = () => {
      openCart();
    };
    window.addEventListener('dashboard-open-cart', handleOpenCart);
    const handleShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        document.querySelector('.topbar-search input')?.focus();
      }
    };

    window.addEventListener('keydown', handleShortcut);
    return () => {
      active = false;
      window.removeEventListener('keydown', handleShortcut);
      window.removeEventListener('dashboard-favorites-updated', handleFavoritesUpdated);
      window.removeEventListener('dashboard-cart-updated', handleCartUpdated);
      window.removeEventListener('pageshow', refreshCartWhenVisible);
      document.removeEventListener('visibilitychange', refreshCartWhenVisible);
      window.removeEventListener('dashboard-open-cart', handleOpenCart);
    };
  }, [session?.user?.email, openCart]);

  useEffect(() => {
    if (!searchFocused || searchProductsLoadedRef.current) return;
    searchProductsLoadedRef.current = true;
    fetch('/api/products?purpose=search')
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os produtos para busca.');
        setSearchableProducts(data.products || []);
      })
      .catch((error) => {
        searchProductsLoadedRef.current = false;
        console.error(error);
      });
  }, [searchFocused]);

  const normalizedSearchText = (text = '') => String(text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
  const searchContainsOffensiveContent = contentModeration.containsOffensiveContent(search);

  const searchResults = useMemo(() => {
    const query = normalizedSearchText(search);
    if (!query || searchContainsOffensiveContent) return [];

    return searchableProducts.filter((product) => {
      const haystack = [
        product.title,
        product.categories,
        product.subcategory,
        product.brand,
        product.description,
      ].flat().filter(Boolean).join(' ');
      return normalizedSearchText(haystack).includes(query);
    });
  }, [search, searchContainsOffensiveContent, searchableProducts]);

  const quickSuggestions = useMemo(() => searchableProducts.slice(0, 4), [searchableProducts]);
  const selectedDeliveryAddress = savedAddresses.find((address) => String(address.id) === selectedAddressId);

  const saveCart = async (nextCart) => {
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    const normalizedCart = normalizeCartItems(nextCart);
    cartItemsRef.current = normalizedCart;
    setCartItems(normalizedCart);
    setCartCount(getCartItemCount(normalizedCart));
    localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
    window.dispatchEvent(new CustomEvent('dashboard-cart-updated', { detail: normalizedCart }));

    cartWriteQueueRef.current = cartWriteQueueRef.current
      .then(async () => {
        const response = await fetch('/api/cart', {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cart: normalizedCart }),
        });
        if (!response.ok) throw new Error('Carrinho indisponível');
      })
      .catch((error) => {
        setCheckoutStatus(`O carrinho foi salvo neste dispositivo, mas não foi possível sincronizá-lo: ${error.message}`);
      });
    await cartWriteQueueRef.current;
  };

  const addToCart = (product) => {
    const price = Number(product.salePrice ?? product.price ?? 0);
    const saleUnit = product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade';
    const step = saleUnit === 'Quilograma' ? 0.1 : 1;
    const currentCart = cartItemsRef.current;
    const existing = currentCart.find((item) => String(item.productId || '') === String(product.id) || item.name === product.title);
    const nextCart = existing
      ? currentCart.map((item) => item === existing ? { ...item, quantity: Math.round(((Number(item.quantity) || step) + step) * 10) / 10 } : item)
      : [...currentCart, { productId: product.id, name: product.title, category: product.categories?.[0] || '', price: `R$ ${price.toFixed(2).replace('.', ',')}${saleUnit === 'Quilograma' ? ' / kg' : ''}`, image: product.image || '', quantity: step, saleUnit }];
    saveCart(nextCart);
    setCheckoutStatus(saleUnit === 'Quilograma' ? `100 g de ${product.title} foram adicionados ao carrinho.` : `${product.title} foi adicionado ao carrinho.`);
  };

  const changeCartQuantity = (item, delta) => {
    const itemKey = String(item.productId || item.name);
    const matchingProduct = searchableProducts.find((product) => String(product.id) === String(item.productId || '') || product.title === item.name);
    const saleUnit = item.saleUnit === 'Quilograma' || matchingProduct?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade';
    const nextCart = cartItemsRef.current
      .map((current) => String(current.productId || current.name) === itemKey
        ? { ...current, saleUnit, quantity: adjustCartQuantity(current.quantity, delta, saleUnit) }
        : current)
    saveCart(nextCart);
  };

  const removeCartItem = (item) => {
    const itemKey = String(item.productId || item.name);
    saveCart(cartItemsRef.current.filter((current) => String(current.productId || current.name) !== itemKey));
  };

  const toggleTheme = () => {
    const nextPreference = theme === 'dark' ? 'Claro' : 'Escuro';
    const nextTheme = nextPreference === 'Claro' ? 'light' : 'dark';
    setTheme(nextTheme);
    try {
      const settings = JSON.parse(localStorage.getItem('dashboard-settings') || '{}');
      localStorage.setItem('dashboard-settings', JSON.stringify({ ...settings, theme: nextPreference }));
      window.dispatchEvent(new Event('dashboard-theme-updated'));
    } catch (error) {
      setCheckoutStatus(`Não foi possível salvar o tema escolhido: ${error.message}`);
    }
  };
  const applyCoupon = async () => {
    const code = coupon.trim().toUpperCase();
    if (validCoupons[code]) {
      setCouponDiscountPercent(validCoupons[code] * 100);
      setAppliedCouponCode(code);
      setCouponStatus(`Cupom ${code} aplicado com sucesso!`);
      return;
    }
    try {
      const response = await fetch('/api/coupons');
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível validar seus cupons.');
      const assignedCoupon = (data.coupons || []).find((item) => item.code === code);
      if (!assignedCoupon) {
        setCouponDiscountPercent(0);
        setAppliedCouponCode('');
        setCouponStatus('Cupom inválido, expirado ou não disponível para sua conta.');
        return;
      }
      setCouponDiscountPercent(assignedCoupon.discountPercent);
      setAppliedCouponCode(code);
      setCouponStatus(`Cupom ${code} aplicado: ${assignedCoupon.discountPercent}% de desconto.`);
    } catch (error) {
      setCouponDiscountPercent(0);
      setAppliedCouponCode('');
      setCouponStatus(error.message);
    }
  };
  const finishPurchase = (event) => {
    event.preventDefault();
    if (!cartItems.length) return setCheckoutStatus('Adicione produtos antes de finalizar.');
    if (!session?.user?.email) return setCheckoutStatus('É necessário estar autenticado para finalizar a compra.');
    if (addressesLoading) return setCheckoutStatus('Estamos verificando seus endereços. Aguarde um instante.');
    if (addressLoadError) return setCheckoutStatus(`Não foi possível confirmar seus endereços: ${addressLoadError}`);
    if (!selectedDeliveryAddress) return setCheckoutStatus('Cadastre um endereço no painel do cliente antes de concluir a compra.');
    if (!isPaymentMethod(paymentMethod)) return setCheckoutStatus('Selecione uma forma no campo Forma de pagamento; você também pode defini-la na aba Formas de pagamento.');

    setCheckoutStatus('');
    setCpfNoteDialogOpen(true);
  };

  const submitPurchase = async (includeCpfOnReceipt) => {
    if (addressesLoading || addressLoadError || !selectedDeliveryAddress) {
      setCheckoutStatus(addressesLoading
        ? 'Estamos verificando seus endereços. Aguarde um instante.'
        : addressLoadError
        ? `Não foi possível confirmar seus endereços: ${addressLoadError}`
        : 'O endereço salvo não está mais disponível. Atualize os endereços no painel e tente novamente.');
      setCpfNoteDialogOpen(false);
      return;
    }
    setCpfNoteDialogOpen(false);
    setCheckoutLoading(true);
    setCheckoutStatus('');
    const total = cartTotals.total;
    try {
      const response = await fetch('/api/erp/orders', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: cartItems,
          address: getAddressValue(selectedDeliveryAddress),
          addressId: selectedAddressId,
          addressDetails: selectedDeliveryAddress,
          paymentMethod,
          includeCpfOnReceipt,
          couponCode: coupon.trim().toUpperCase(),
          total: `R$ ${total.toFixed(2).replace('.', ',')}`,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível finalizar a compra.');
      await saveCart([]);
      setCoupon('');
      setCouponDiscountPercent(0);
      setAppliedCouponCode('');
      setCouponStatus('');
      setCheckoutStatus(`Pedido ${data.order.id} realizado com sucesso.`);
      window.dispatchEvent(new Event('dashboard-coupons-updated'));
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
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') loadNotifications();
    };
    const interval = window.setInterval(refreshWhenVisible, 60000);
    window.addEventListener('dashboard-settings-updated', loadNotifications);
    window.addEventListener('dashboard-notifications-updated', loadNotifications);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => { active = false; window.clearInterval(interval); window.removeEventListener('dashboard-settings-updated', loadNotifications); window.removeEventListener('dashboard-notifications-updated', loadNotifications); document.removeEventListener('visibilitychange', refreshWhenVisible); };
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
    <div className="dashboard-shell" data-dashboard-theme={theme} data-hj-suppress>
      <Script src="/analytics-consent.js" strategy="afterInteractive" />
      <a className="dashboard-skip-link" href="#dashboard-main-content">Pular para o conteúdo principal</a>
      <aside className="sidebar" aria-label="Painel do cliente">
        <div>
          <div className="brand-wrap">
            <div className="brand-mark">
              <img src="/logo-hj.webp" alt="" />
            </div>
            <div>
              <p className="brand-kicker">Cliente</p>
              <h2>Hoje Supermercado</h2>
            </div>
            <button
              type="button"
              className="sidebar-menu-toggle"
              ref={mobileNavToggleRef}
              aria-label={mobileNavOpen ? 'Fechar menu' : 'Abrir menu'}
              aria-controls="dashboard-primary-navigation"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          {mobileNavOpen && <button type="button" className="sidebar-nav-backdrop" aria-label="Fechar navegação" onClick={() => { setMobileNavOpen(false); mobileNavToggleRef.current?.focus(); }} />}

          <nav id="dashboard-primary-navigation" className={`sidebar-nav ${mobileNavOpen ? 'mobile-open' : ''}`} aria-label="Navegação principal do cliente">
            {navigationGroups.map(({ label, items }) => (
              <div key={label} className="sidebar-nav-group">
                <span className="sidebar-nav-group-label">{label}</span>
                <div className="sidebar-nav-group-items">
                  {items.map(({ label: itemLabel, href, icon: Icon }) => {
                    const active = pathname === href || (href !== '/dashboard' && pathname.startsWith(href));

                    return (
                      <Link
                        key={itemLabel}
                        href={href}
                        className={`sidebar-item ${active ? 'active' : ''}`}
                        aria-current={active ? 'page' : undefined}
                        onClick={() => setMobileNavOpen(false)}
                      >
                        <Icon size={18} aria-hidden="true" />
                        <span>{itemLabel}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        <div className="sidebar-footer">
          <a className="store-return-link" href="/">
            <Store size={16} />
            <span>Voltar para a loja</span>
          </a>

          <div className="user-mini">
            <div className="avatar">{profilePhoto ? <img src={profilePhoto} alt="" /> : initials}</div>
            <div>
              <strong>{profileName || session?.user?.name || 'Usuário Google'}</strong>
              <span>{session?.user?.email || 'usuario@gmail.com'}</span>
            </div>
          </div>

          <button type="button" className="signout-btn" onClick={() => signOut({ callbackUrl: '/login' })}>
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
                  aria-label="Buscar produtos"
                  aria-invalid={searchContainsOffensiveContent}
                  aria-describedby={searchContainsOffensiveContent ? 'dashboard-search-moderation-error' : undefined}
                  aria-controls="dashboard-product-search-results"
                  aria-expanded={searchFocused}
                />
                {search ? (
                  <button type="button" className="search-clear" aria-label="Limpar busca" onMouseDown={(event) => event.preventDefault()} onClick={() => setSearch('')}>
                    <X size={15} />
                  </button>
                ) : <kbd>Ctrl K</kbd>}

                {searchFocused && (
                  <div id="dashboard-product-search-results" className={`search-suggestions ${searchResults.length >= 7 ? 'has-many-results' : ''}`} role="region" aria-label="Resultados e sugestões de produtos">
                    {search.trim() ? (
                      <>
                        <div className="search-suggestions-heading">
                          <div>
                            <span className="search-suggestions-label">Resultados da busca</span>
                            <span className="search-suggestions-caption">Produtos disponíveis na loja</span>
                          </div>
                          {searchResults.length > 0 && <span className="search-results-count">{searchResults.length}</span>}
                        </div>
                        {searchContainsOffensiveContent ? (
                          <span id="dashboard-search-moderation-error" className="search-suggestions-empty search-moderation-error" role="alert">
                            Remova termos ofensivos para continuar a busca.
                          </span>
                        ) : searchResults.length ? searchResults.map((product) => {
                          const price = Number(product.salePrice ?? product.price ?? 0);
                          const originalPrice = Number(product.price ?? price);
                          const configuredDiscount = Number(product.discount) || 0;
                          const calculatedDiscount = originalPrice > 0 ? ((originalPrice - price) / originalPrice) * 100 : 0;
                          const discountPercent = configuredDiscount > 0 ? configuredDiscount : calculatedDiscount;
                          const isOnOffer = originalPrice > price && discountPercent > 0;
                          const cartItem = cartItems.find((item) => String(item.productId || '') === String(product.id) || item.name === product.title);
                          const quantity = cartItem?.quantity || 0;
                          const imageKey = String(product.id);
                          const hasImage = Boolean(product.image) && !failedSearchImages[imageKey];
                          return (
                            <div key={product.id} className="dashboard-search-product">
                              <span className="dashboard-search-product-image">
                                {hasImage
                                  ? <img src={product.image} alt="" loading="lazy" decoding="async" onError={() => setFailedSearchImages((current) => ({ ...current, [imageKey]: true }))} />
                                  : <ShoppingBag size={18} aria-hidden="true" />}
                              </span>
                              <span className="dashboard-search-product-info">
                                <span className="dashboard-search-product-title">
                                  <strong>{product.title}</strong>
                                  {isOnOffer && <span className="dashboard-search-offer-badge">OFERTA -{discountPercent.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</span>}
                                </span>
                                <small>{product.categories?.join(', ') || product.subcategory || 'Mercearia'}</small>
                                <span className="dashboard-search-price">
                                  R$ {price.toFixed(2).replace('.', ',')}{product.saleUnit === 'Quilograma' ? ' / kg' : ''}
                                  {originalPrice > price && <del>R$ {originalPrice.toFixed(2).replace('.', ',')}{product.saleUnit === 'Quilograma' ? ' / kg' : ''}</del>}
                                </span>
                              </span>
                              {quantity > 0 ? (
                                <span className="dashboard-search-quantity">
                                  <button type="button" aria-label={`Remover ${product.title} do carrinho`} onMouseDown={(event) => event.preventDefault()} onClick={() => removeCartItem(cartItem)}>
                                    <Trash2 size={13} />
                                  </button>
                                  <strong aria-live="polite">{formatCartQuantity(cartItem)}</strong>
                                  <button type="button" aria-label={`Aumentar ${product.saleUnit === 'Quilograma' ? '100 gramas' : 'quantidade'} de ${product.title}`} onMouseDown={(event) => event.preventDefault()} onClick={() => addToCart(product)}>
                                    <Plus size={13} />
                                  </button>
                                </span>
                              ) : (
                                <button className="dashboard-search-buy" type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => addToCart(product)}>
                                  <Plus size={14} /> <span>Adicionar</span>
                                </button>
                              )}
                            </div>
                          );
                        }) : (
                          <span className="search-suggestions-empty">Nenhum produto encontrado. Confira a escrita ou tente outro termo.</span>
                        )}
                      </>
                    ) : (
                      <>
                        <div className="search-suggestions-heading">
                          <div>
                            <span className="search-suggestions-label">Sugestões para você</span>
                            <span className="search-suggestions-caption">Comece por um produto popular</span>
                          </div>
                        </div>
                        {quickSuggestions.map((product) => (
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
              <button className="dashboard-cart-button" type="button" aria-label={`Carrinho com ${cartCount} ${cartCount === 1 ? 'item' : 'itens'}`} onClick={openCart}>
                <ShoppingCart size={18} />
                <span className="dashboard-cart-count">{cartCount}</span>
              </button>
              <Link href="/dashboard/favorites" className="icon-button favorites-icon-button" aria-label={favoritesCount === null ? 'Favoritos, carregando quantidade de itens salvos' : `Favoritos, ${favoritesCount} itens salvos`} title={`Favoritos (${favoritesCount ?? 0})`}>
                <Star size={18} />
                <span className="favorites-icon-count">{favoritesCount === null ? '…' : favoritesCount > 99 ? '99+' : favoritesCount}</span>
              </Link>
              <button className="icon-button notification-button" type="button" aria-label={`Notificações${notificationCount ? `, ${notificationCount} não lidas` : ''}`} aria-expanded={notificationsOpen} aria-controls="dashboard-notification-inbox" onClick={() => setNotificationsOpen((current) => !current)}>
                <Bell size={18} />
                {notificationCount > 0 && <span className="notification-count">{notificationCount > 9 ? '9+' : notificationCount}</span>}
              </button>
              {notificationsOpen && <div id="dashboard-notification-inbox" className="notification-inbox" role="region" aria-label="Notificações"><div className="notification-inbox-header"><div><strong>Notificações</strong><small>{notificationCount ? `${notificationCount} não lida(s)` : 'Tudo em dia'}</small></div><button type="button" aria-label="Fechar notificações" onClick={() => setNotificationsOpen(false)}><X size={15} /></button></div>{notifications.length ? <div className="notification-inbox-list">{notifications.map((notification) => { const seen = JSON.parse(localStorage.getItem(`hoje-notifications-seen-${session?.user?.email}`) || '[]').includes(notification.id); return <button type="button" key={notification.id} className={`notification-inbox-item ${seen ? 'is-read' : 'is-unread'}`} onClick={() => markNotificationRead(notification.id)}><span className="notification-inbox-dot" /><span><strong>{notification.title}</strong><small>{notification.message}</small><em>{notification.durationDays ? `${notification.durationDays} dias` : 'Mensagem ativa'}</em></span></button>; })}</div> : <div className="notification-inbox-empty"><Bell size={20} /><span>Nenhuma mensagem disponível.</span></div>}</div>}
              <button
                className="icon-button theme-toggle"
                type="button"
                aria-label={`Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
                aria-pressed={theme === 'light'}
                title={`Ativar tema ${theme === 'dark' ? 'claro' : 'escuro'}`}
                onClick={toggleTheme}
              >
                {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
              </button>
            </div>
          </div>

          <div className="right">
            <div className="delivery-address-picker">
              <button
                type="button"
                className="topbar-delivery-address"
                aria-controls="dashboard-delivery-address-menu"
                aria-expanded={deliveryAddressOpen}
                aria-label={selectedDeliveryAddress ? `Endereço de entrega: ${getAddressHeading(selectedDeliveryAddress)}` : 'Escolher endereço de entrega'}
                onClick={() => setDeliveryAddressOpen((open) => !open)}
              >
                <MapPin size={20} />
                <span className="topbar-delivery-copy">
                  <small>Entregar em</small>
                  <strong>{selectedDeliveryAddress ? getAddressHeading(selectedDeliveryAddress) : 'Escolher endereço'}</strong>
                </span>
                <ChevronDown size={16} />
              </button>
              {deliveryAddressOpen && (
                <div id="dashboard-delivery-address-menu" className="delivery-address-menu">
                  {addressLoadError ? (
                    <span className="delivery-address-menu-empty" role="alert">{addressLoadError}</span>
                  ) : addressesLoading ? (
                    <span className="delivery-address-menu-empty" role="status">Carregando endereços...</span>
                  ) : savedAddresses.length ? savedAddresses.map((address) => (
                    <button
                      type="button"
                      key={address.id}
                      className={String(address.id) === selectedAddressId ? 'selected' : ''}
                      onClick={() => {
                        const addressId = String(address.id);
                        setSelectedAddressId(addressId);
                        localStorage.setItem(deliveryAddressStorageKey(session?.user?.email), addressId);
                        window.dispatchEvent(new CustomEvent('dashboard-address-selected', { detail: { addressId } }));
                        setDeliveryAddressOpen(false);
                      }}
                    >
                      <MapPin size={15} />
                      <span><strong>{address.title || 'Endereço'}</strong><small>{getAddressHeading(address)}</small></span>
                    </button>
                  )) : <span className="delivery-address-menu-empty">Nenhum endereço cadastrado</span>}
                  <Link href="/dashboard/addresses" onClick={() => setDeliveryAddressOpen(false)}>Gerenciar endereços</Link>
                </div>
              )}
            </div>
            <a className="topbar-store-link" href="/">
              <Store size={16} />
              <span>Loja</span>
            </a>
          </div>
        </header>

        <div className="page-container dashboard-page" id="dashboard-main-content" tabIndex="-1">
          {children}
        </div>
      </main>

      {cartOpen && <div className="cart-backdrop open" onMouseDown={(event) => { if (event.target === event.currentTarget) closeCart(); }}>
        <aside ref={cartPanelRef} tabIndex="-1" className="cart-panel open" role="dialog" aria-modal="true" aria-labelledby="cart-panel-title" onMouseDown={(event) => event.stopPropagation()}>
          <div className="cart-panel-header"><div className="cart-panel-title-wrap"><span className="cart-panel-icon"><ShoppingCart size={18} /></span><h3 id="cart-panel-title">Meu Carrinho ({cartCount} {cartCount === 1 ? 'item' : 'itens'})</h3></div><button type="button" className="cart-close" aria-label="Fechar carrinho" onClick={closeCart}>×</button></div>
          <p className="cart-subtitle">Revise seus itens antes de finalizar</p>
          <div className="cart-items">{cartItems.length ? cartItems.map((item) => <div className="cart-item" key={item.productId || item.name}><div className="cart-item-thumb">{item.image ? <img src={item.image} alt={item.name} /> : <div className="cart-thumb-placeholder" />}</div><div className="cart-item-info"><div className="cart-item-name">{item.name}</div><div className="cart-item-category">{item.category || 'Produtos'}</div><div className="cart-item-price">{item.saleUnit === 'Quilograma' && !String(item.price || '').includes('/kg') ? `${item.price} / kg` : item.price}</div></div><div className="cart-item-controls"><button type="button" aria-label={`Diminuir ${item.saleUnit === 'Quilograma' ? '100 gramas' : 'quantidade'} de ${item.name}`} onClick={() => changeCartQuantity(item, -1)}><Minus size={16} /></button><span className="cart-item-qty">{formatCartQuantity(item)}</span><button type="button" aria-label={`Aumentar ${item.saleUnit === 'Quilograma' ? '100 gramas' : 'quantidade'} de ${item.name}`} onClick={() => changeCartQuantity(item, 1)}><Plus size={16} /></button></div><button type="button" className="cart-item-remove" aria-label={`Remover ${item.name}`} onClick={() => removeCartItem(item)}><Trash2 size={16} /></button></div>) : <div className="cart-empty"><ShoppingCart size={28} /><strong>Seu carrinho está vazio</strong></div>}</div>
          <form className="cart-panel-footer" onSubmit={finishPurchase}>
            <div className="cart-summary-box">
              <div className="summary-row">
                <span>Subtotal ({cartCount} itens)</span>
                <strong>R$ {cartTotals.subtotal.toFixed(2).replace('.', ',')}</strong>
              </div>
              <div className="summary-row">
                <span>Descontos</span>
                <strong>R$ {cartTotals.couponDiscountAmount.toFixed(2).replace('.', ',')}</strong>
              </div>
              <div className="summary-row"><span>Frete</span><strong>R$ 0,00</strong></div>
              <div className="summary-row total">
                <span>Total</span>
                <strong>R$ {cartTotals.total.toFixed(2).replace('.', ',')}</strong>
              </div>
            </div>
            <div className="cart-coupon">
              <input
                id="cart-coupon-code"
                value={coupon}
                onChange={(event) => { setCoupon(event.target.value); setCouponDiscountPercent(0); setAppliedCouponCode(''); setCouponStatus(''); }}
                placeholder="Insira seu Cupom"
                maxLength={24}
                aria-label="Código do cupom"
              />
              <button className="btn-coupon" type="button" onClick={applyCoupon}>Aplicar</button>
            </div>
            <p className={`coupon-feedback ${couponStatus.includes('sucesso') ? 'success' : couponStatus ? 'error' : ''}`} role="status" aria-live="polite">{couponStatus}</p>
            {addressLoadError ? (
              <small className="checkout-field-hint" role="alert">Não foi possível confirmar seus endereços: {addressLoadError}</small>
            ) : addressesLoading ? (
              <small className="checkout-field-hint" role="status">Verificando o endereço salvo no painel...</small>
            ) : !selectedDeliveryAddress ? (
              <small className="checkout-field-hint" role="status">
                {savedAddresses.length
                  ? 'Escolha o endereço no seletor do painel.'
                  : <>Nenhum endereço cadastrado. <Link href="/dashboard/addresses">Adicionar endereço</Link></>}
              </small>
            ) : null}
            <label className="delivery-address-field">
              Forma de pagamento
              <select
                required
                value={paymentMethod || ''}
                onChange={(event) => {
                  try {
                    savePaymentMethod(session?.user?.email, event.target.value);
                    setCheckoutStatus('');
                  } catch (error) {
                    setCheckoutStatus(`Não foi possível salvar a preferência de pagamento: ${error.message}`);
                  }
                }}
              >
                <option value="" disabled>Selecione sua forma de pagamento</option>
                {PAYMENT_METHODS.map(({ value, label }) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <small className="checkout-field-hint">Obrigatória para concluir o pedido. <Link href="/dashboard/payment-methods">Gerenciar formas de pagamento</Link></small>
            <button className="btn-finalizar" type="submit" disabled={checkoutLoading || !cartItems.length}>
              {checkoutLoading ? 'Finalizando...' : 'Finalizar Pedido'}
            </button>
            <button type="button" className="btn-limpar" onClick={() => saveCart([])}>Limpar Carrinho</button>
            {checkoutStatus && <p className={`coupon-feedback ${checkoutStatus.includes('sucesso') ? 'success' : 'error'}`} role="status" aria-live="polite">
              {checkoutStatus}
              {checkoutStatus.includes('realizado com sucesso') && <Link className="checkout-receipt-link" href="/dashboard/orders" onClick={() => { setCartOpen(false); setCheckoutStatus(''); }}>Ver pedido e comprovante</Link>}
            </p>}
            <dialog
              ref={cpfNoteDialogRef}
              className="cpf-note-dialog"
              aria-labelledby="dashboard-cpf-note-title"
              aria-describedby="dashboard-cpf-note-description"
              onCancel={(event) => { event.preventDefault(); setCpfNoteDialogOpen(false); }}
            >
              <div className="cpf-note-dialog-content">
                <span className="settings-kicker">Dados para documento fiscal</span>
                <h2 id="dashboard-cpf-note-title">Deseja registrar CPF para a nota fiscal?</h2>
                <p id="dashboard-cpf-note-description">A escolha é obrigatória para enviar o pedido. Se responder Sim, registraremos o CPF do seu perfil. A NFC-e oficial ainda não é emitida por este sistema; o comprovante do pedido não a substitui.</p>
                <div className="cpf-note-dialog-actions">
                  <button ref={cpfNoteNoButtonRef} type="button" className="cpf-note-choice cpf-note-no" disabled={checkoutLoading} onClick={() => submitPurchase(false)}>Não, continuar sem CPF</button>
                  <button type="button" className="cpf-note-choice cpf-note-yes" disabled={checkoutLoading} onClick={() => submitPurchase(true)}>Sim, registrar meu CPF</button>
                  <button type="button" className="cpf-note-cancel" onClick={() => setCpfNoteDialogOpen(false)}>Voltar ao carrinho</button>
                </div>
              </div>
            </dialog>
          </form>
        </aside>
      </div>}
    </div>
  );
}
