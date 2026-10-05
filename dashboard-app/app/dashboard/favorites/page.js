'use client';

import Link from 'next/link';
import { useSession } from 'next-auth/react';
import { ArrowRight, ChevronLeft, ChevronRight, Heart, Package, Plus, ShoppingCart, Tag, Trash2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { adjustCartQuantity, formatCartQuantity, isSameCartProduct, normalizeCartItems, removeCartProduct } from '../cart-utils';
import { getFavoriteDiscountPercent, syncFavoritesWithCatalog } from '../favorite-utils';

const FAVORITES_API = '/api/favorites';
const ALL_CATEGORIES = '__all__';
const getFavoriteCategory = (item) => typeof item.category === 'string' ? item.category.trim() || 'Sem categoria' : 'Sem categoria';
const getFavoriteKey = (item) => String(item.productId || item.id || item.name);

export default function FavoritesPage() {
  const { data: session } = useSession();
  const [favorites, setFavorites] = useState([]);
  const [activeCategory, setActiveCategory] = useState(ALL_CATEGORIES);
  const [cartItems, setCartItems] = useState([]);
  const [cartFeedback, setCartFeedback] = useState('');
  const [favoriteFeedback, setFavoriteFeedback] = useState('');
  const [catalogFeedback, setCatalogFeedback] = useState('');
  const [favoritesLoadError, setFavoritesLoadError] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [removingFavoriteKey, setRemovingFavoriteKey] = useState('');
  const [carouselStates, setCarouselStates] = useState({});
  const [failedFavoriteImages, setFailedFavoriteImages] = useState({});
  const carouselRefs = useRef({});
  const favoriteRemoveRefs = useRef({});
  const favoriteActionRefs = useRef({});
  const allCategoriesRef = useRef(null);
  const favoritesHeadingRef = useRef(null);

  useEffect(() => {
    let active = true;
    setIsLoading(true);
    setFavoritesLoadError('');
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    const loadFavorites = async () => {
      let savedFavorites;
      try {
        const response = await fetch(FAVORITES_API, { cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível carregar os favoritos.');
        const data = await response.json();
        if (!Array.isArray(data.favorites)) throw new Error('A resposta dos favoritos está em um formato inválido.');
        savedFavorites = data.favorites;
      } catch (error) {
        if (active) {
          setFavoritesLoadError(error.message || 'Não foi possível carregar os favoritos.');
          setIsLoading(false);
          console.error('Não foi possível carregar os favoritos do cliente:', error);
        }
        return;
      }

      if (!active) return;
      setFavorites(savedFavorites);
      setIsLoading(false);
      window.dispatchEvent(new CustomEvent('dashboard-favorites-updated', { detail: savedFavorites.length }));

      try {
        const response = await fetch('/api/products', { cache: 'no-store' });
        const catalog = await response.json();
        if (!response.ok) throw new Error(catalog.error || 'Catálogo indisponível.');
        if (!Array.isArray(catalog.products)) throw new Error('Resposta inválida do catálogo.');
        if (!active) return;
        const currentFavorites = syncFavoritesWithCatalog(savedFavorites, catalog.products);
        setFavorites(currentFavorites);
        setCatalogFeedback('');
      } catch (error) {
        if (active) setCatalogFeedback(`Seus favoritos foram carregados, mas os preços e detalhes atuais não estão disponíveis: ${error.message}`);
      }
    };

    void loadFavorites();

    const localCart = localStorage.getItem(cartStorageKey);
    if (localCart !== null) {
      try {
        const storedCart = JSON.parse(localCart);
        if (Array.isArray(storedCart)) {
          const normalizedCart = normalizeCartItems(storedCart);
          setCartItems(normalizedCart);
          localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
        }
      } catch {
        setCartFeedback('Não foi possível ler o carrinho salvo neste dispositivo.');
      }
    }
    const handleCartUpdated = (event) => {
      if (Array.isArray(event.detail)) setCartItems(normalizeCartItems(event.detail));
    };
    window.addEventListener('dashboard-cart-updated', handleCartUpdated);
    return () => {
      active = false;
      window.removeEventListener('dashboard-cart-updated', handleCartUpdated);
    };
  }, [session?.user?.email, retryCount]);

  const saveCart = async (nextCart) => {
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    const normalizedCart = normalizeCartItems(nextCart);
    setCartItems(normalizedCart);
    let localStorageError = '';
    try {
      localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
    } catch (error) {
      localStorageError = error.message || 'Armazenamento local indisponível.';
    }
    window.dispatchEvent(new CustomEvent('dashboard-cart-updated', { detail: normalizedCart }));
    try {
      const response = await fetch('/api/cart', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: normalizedCart }),
      });
      if (!response.ok) throw new Error('Não foi possível sincronizar o carrinho.');
      setCartFeedback(localStorageError
        ? `Carrinho sincronizado com sua conta, mas não foi possível salvá-lo neste dispositivo: ${localStorageError}`
        : '');
    } catch (error) {
      setCartFeedback(localStorageError
        ? `O carrinho foi atualizado nesta sessão, mas não pôde ser salvo neste dispositivo nem sincronizado: ${error.message}`
        : `O carrinho foi salvo neste dispositivo, mas não sincronizou: ${error.message}`);
    }
  };

  const addToCart = (item) => {
    const existing = cartItems.find((cartItem) => isSameCartProduct(cartItem, item));
    const saleUnit = item.saleUnit === 'Quilograma' || existing?.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade';
    const step = saleUnit === 'Quilograma' ? 0.1 : 1;
    const nextCart = existing
      ? cartItems.map((cartItem) => isSameCartProduct(cartItem, item) ? { ...cartItem, saleUnit, quantity: adjustCartQuantity(cartItem.quantity, 1, saleUnit) } : cartItem)
      : [...cartItems, { productId: item.id, name: item.name, category: item.category, price: item.price, image: item.image || '', quantity: step, saleUnit }];
    saveCart(nextCart);
  };

  const removeFromCart = (item) => {
    saveCart(removeCartProduct(cartItems, item));
  };

  const handleAddToCart = (item) => {
    const alreadyInCart = cartItems.some((cartItem) => isSameCartProduct(cartItem, item));
    addToCart(item);
    if (!alreadyInCart) {
      window.requestAnimationFrame(() => favoriteActionRefs.current[getFavoriteKey(item)]?.focus());
    }
  };

  const handleRemoveFromCart = (item) => {
    removeFromCart(item);
    window.requestAnimationFrame(() => favoriteActionRefs.current[getFavoriteKey(item)]?.focus());
  };

  const toggleFavorite = async (item) => {
    if (removingFavoriteKey) return;
    const favoriteKey = getFavoriteKey(item);
    const previousFavorites = favorites;
    const nextFavorites = favorites.filter((favorite) => getFavoriteKey(favorite) !== favoriteKey);
    const removedIndex = favorites.findIndex((favorite) => getFavoriteKey(favorite) === favoriteKey);
    const nextFocusFavorite = nextFavorites[Math.min(removedIndex, nextFavorites.length - 1)];
    setRemovingFavoriteKey(favoriteKey);
    setFavorites(nextFavorites);
    if (activeCategory !== ALL_CATEGORIES && !nextFavorites.some((item) => getFavoriteCategory(item) === activeCategory)) {
      setActiveCategory(ALL_CATEGORIES);
    }
    window.dispatchEvent(new CustomEvent('dashboard-favorites-updated', { detail: nextFavorites.length }));
    window.requestAnimationFrame(() => {
      const nextRemoveButton = nextFocusFavorite && favoriteRemoveRefs.current[getFavoriteKey(nextFocusFavorite)];
      (nextRemoveButton || allCategoriesRef.current || favoritesHeadingRef.current)?.focus();
    });
    try {
      const response = await fetch(FAVORITES_API, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: item.productId || item.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível atualizar os favoritos.');
      setFavoriteFeedback('');
    } catch (error) {
      setFavorites(previousFavorites);
      window.dispatchEvent(new CustomEvent('dashboard-favorites-updated', { detail: previousFavorites.length }));
      setFavoriteFeedback(error.message);
    } finally {
      setRemovingFavoriteKey('');
    }
  };

  const categories = [...new Set(favorites.map(getFavoriteCategory))].sort((first, second) => first.localeCompare(second, 'pt-BR'));
  const visibleFavorites = activeCategory === ALL_CATEGORIES ? favorites : favorites.filter((item) => getFavoriteCategory(item) === activeCategory);
  const favoriteShelves = (activeCategory === ALL_CATEGORIES ? categories : [activeCategory]).map((category) => ({
    category,
    items: favorites.filter((item) => getFavoriteCategory(item) === category),
  }));
  const updateCarouselState = useCallback((category) => {
    const track = carouselRefs.current[category];
    if (!track) return;
    const nextState = {
      hasOverflow: track.scrollWidth - track.clientWidth > 2,
      canScrollBack: track.scrollLeft > 2,
      canScrollForward: track.scrollWidth - track.clientWidth - track.scrollLeft > 2,
    };
    setCarouselStates((current) => {
      const previous = current[category];
      if (previous
        && previous.hasOverflow === nextState.hasOverflow
        && previous.canScrollBack === nextState.canScrollBack
        && previous.canScrollForward === nextState.canScrollForward) return current;
      return { ...current, [category]: nextState };
    });
  }, []);
  useEffect(() => {
    const categoriesToMeasure = activeCategory === ALL_CATEGORIES
      ? [...new Set(favorites.map(getFavoriteCategory))]
      : [activeCategory];
    const updateAllCarousels = () => categoriesToMeasure.forEach(updateCarouselState);
    updateAllCarousels();
    window.addEventListener('resize', updateAllCarousels);
    return () => window.removeEventListener('resize', updateAllCarousels);
  }, [favorites, activeCategory, updateCarouselState]);
  const scrollFavoriteCarousel = (category, direction) => {
    const track = carouselRefs.current[category];
    if (!track) return;
    const behavior = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
    track.scrollBy({ left: direction * Math.max(track.clientWidth * 0.75, 260), behavior });
  };
  const renderFavoriteCard = (item) => {
    const favoriteKey = getFavoriteKey(item);
    const cartItem = cartItems.find((currentItem) => isSameCartProduct(currentItem, item));
    const discountPercent = getFavoriteDiscountPercent(item);
    const hasImage = item.image && !failedFavoriteImages[`${favoriteKey}:${item.image}`];

    return (
      <article key={favoriteKey} className="favorite-card" role="listitem">
        <div className="favorite-card-top">
          {discountPercent > 0 && <span className="badge-pill offer"><Tag size={11} aria-hidden="true" /> Oferta · {discountPercent}%</span>}
          <button
            type="button"
            className="icon-button-small heart-filled"
            aria-label={`Remover ${item.name} dos favoritos`}
            aria-pressed="true"
            aria-busy={removingFavoriteKey === favoriteKey}
            disabled={Boolean(removingFavoriteKey)}
            onClick={() => toggleFavorite(item)}
          >
            <Heart size={17} fill="currentColor" aria-hidden="true" />
          </button>
        </div>

        <div className="product-box">
          {hasImage ? (
            <img
              src={item.image}
              alt=""
              loading="lazy"
              className="favorite-product-image"
              onError={() => setFailedFavoriteImages((current) => ({ ...current, [`${favoriteKey}:${item.image}`]: true }))}
            />
          ) : (
            <div className="product-icon"><Package size={28} aria-hidden="true" /></div>
          )}
        </div>

        <div className="favorite-product-copy">
          <h3>{item.name}</h3>
          <span>{item.category || 'Categoria não informada'}</span>
        </div>

        <div className="price">
          <div>
            <strong>{item.price || 'Preço indisponível'}</strong>
            {discountPercent > 0 && <small>De {item.oldPrice}</small>}
          </div>
          <span className="favorite-unit">{item.saleUnit === 'Quilograma' ? 'por kg' : 'por unidade'}</span>
        </div>

        <div className="favorite-card-actions">
          {cartItem && (
            <div className="favorite-quantity" role="group" aria-label={`Quantidade no carrinho de ${item.name}`}>
              <button type="button" aria-label={`Remover ${item.name} do carrinho`} onClick={() => handleRemoveFromCart(item)}>
                <Trash2 size={15} aria-hidden="true" />
              </button>
              <strong aria-live="polite" aria-atomic="true">{formatCartQuantity(cartItem)}</strong>
              <button type="button" aria-label={`Aumentar ${item.saleUnit === 'Quilograma' ? '100 gramas' : 'quantidade'} de ${item.name}`} onClick={() => addToCart(item)}>
                <Plus size={15} aria-hidden="true" />
              </button>
            </div>
          )}
          {!cartItem && (
            <button
              ref={(node) => {
                if (node) favoriteActionRefs.current[favoriteKey] = node;
                else delete favoriteActionRefs.current[favoriteKey];
              }}
              type="button"
              className="favorite-buy-btn"
              aria-label={item.saleUnit === 'Quilograma' ? `Adicionar 100 gramas de ${item.name} ao carrinho` : `Adicionar ${item.name} ao carrinho`}
              onClick={() => handleAddToCart(item)}
            >
              <ShoppingCart size={16} aria-hidden="true" />
              Adicionar
            </button>
          )}
        </div>
      </article>
    );
  };

  return (
    <div className="section-shell favorites-showcase">
      <header className="favorites-showcase-header">
        <div className="favorites-title-wrap">
          <span className="favorites-hero-icon" aria-hidden="true"><Heart size={25} fill="currentColor" /></span>
          <div>
            <span className="favorites-kicker">Sua seleção</span>
            <h1 ref={favoritesHeadingRef} tabIndex="-1">Seus <em>favoritos</em></h1>
            <p>Reúna os produtos que você quer encontrar com facilidade na próxima compra.</p>
          </div>
        </div>
        <aside className="favorites-promo-banner" aria-label="Explore os produtos da loja">
          <div>
            <span><Heart size={14} fill="currentColor" aria-hidden="true" /> Sua lista, sempre à mão</span>
            <small>Salve produtos para voltar a eles quando for preparar seu próximo pedido.</small>
            <Link href="/">Explorar a loja <ArrowRight size={13} aria-hidden="true" /></Link>
          </div>
          <span className="favorites-promo-orbit" aria-hidden="true"><ShoppingCart size={33} /></span>
        </aside>
      </header>

      {catalogFeedback && <p className="favorites-feedback favorites-feedback-warning" role="status" aria-live="polite">{catalogFeedback}</p>}
      {favoriteFeedback && <p className="favorites-feedback" role="alert" aria-live="polite">{favoriteFeedback}</p>}
      {cartFeedback && <p className="favorites-feedback" role="alert" aria-live="polite">{cartFeedback}</p>}

      {isLoading ? (
        <div className="favorites-loading" role="status"><span className="favorites-loading-indicator" aria-hidden="true" />Carregando seus favoritos...</div>
      ) : favoritesLoadError ? (
        <div className="empty-state favorites-error-state" role="alert">
          <div className="empty-state-box"><Heart size={32} aria-hidden="true" /></div>
          <h3>Não foi possível carregar seus favoritos</h3>
          <p>{favoritesLoadError}</p>
          <button type="button" className="primary-cta" onClick={() => setRetryCount((count) => count + 1)}>Tentar novamente</button>
        </div>
      ) : favorites.length === 0 ? (
        <div className="empty-state favorites-empty-state">
          <div className="empty-state-box"><Heart size={32} aria-hidden="true" /></div>
          <h3>Nenhum favorito por enquanto</h3>
          <p>Toque no coração de um produto na loja para salvá-lo nesta lista.</p>
          <Link href="/" className="primary-cta">Encontrar produtos</Link>
        </div>
      ) : (
        <>
          <div className="favorites-category-tabs" role="group" aria-label="Filtrar favoritos por categoria">
            {[
              { value: ALL_CATEGORIES, label: 'Todas as categorias' },
              ...categories.map((category) => ({ value: category, label: category })),
            ].map(({ value, label }) => (
              <button
                ref={value === ALL_CATEGORIES ? allCategoriesRef : undefined}
                key={value}
                type="button"
                className={activeCategory === value ? 'active' : ''}
                aria-label={`Filtrar favoritos: ${label}`}
                aria-pressed={activeCategory === value}
                onClick={() => setActiveCategory(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="favorites-showcase-rule">
            <span role="status" aria-live="polite" aria-atomic="true">
              {visibleFavorites.length} {visibleFavorites.length === 1 ? 'produto salvo' : 'produtos salvos'}
            </span>
            <span>Hoje Supermercado</span>
          </div>

          <div className="favorites-category-shelves">
            {favoriteShelves.filter(({ items }) => items.length > 0).map(({ category, items }) => {
              const categoryId = `favorites-category-${encodeURIComponent(category)}`;
              const carouselId = `favorites-carousel-${encodeURIComponent(category)}`;
              const carouselState = carouselStates[category];
              return (
                <section key={category} className="favorites-category-shelf" aria-labelledby={categoryId}>
                  <div className="favorites-shelf-heading">
                    <div>
                      <h2 id={categoryId}>{category}</h2>
                      <span>{items.length} {items.length === 1 ? 'produto' : 'produtos'}</span>
                    </div>
                    {carouselState?.hasOverflow && (
                      <div className="favorites-carousel-controls" role="group" aria-label={`Navegar pelos favoritos de ${category}`}>
                        <button
                          type="button"
                          className="favorites-carousel-button"
                          aria-label={`Rolar ${category} para a esquerda`}
                          aria-controls={carouselId}
                          disabled={!carouselState.canScrollBack}
                          onClick={() => scrollFavoriteCarousel(category, -1)}
                        >
                          <ChevronLeft size={19} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          className="favorites-carousel-button"
                          aria-label={`Rolar ${category} para a direita`}
                          aria-controls={carouselId}
                          disabled={!carouselState.canScrollForward}
                          onClick={() => scrollFavoriteCarousel(category, 1)}
                        >
                          <ChevronRight size={19} aria-hidden="true" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div
                    id={carouselId}
                    className="favorites-carousel-track"
                    role="list"
                    aria-label={`Produtos favoritos da categoria ${category}`}
                    tabIndex="0"
                    onScroll={() => updateCarouselState(category)}
                    ref={(node) => { carouselRefs.current[category] = node; }}
                  >
                    {items.map(renderFavoriteCard)}
                  </div>
                </section>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
