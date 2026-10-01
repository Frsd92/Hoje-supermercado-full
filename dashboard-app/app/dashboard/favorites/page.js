'use client';

import { useSession } from 'next-auth/react';
import { ArrowRight, Heart, Plus, ShoppingCart, Star, Tag, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { adjustCartQuantity, formatCartQuantity, isSameCartProduct, normalizeCartItems, removeCartProduct } from '../cart-utils';
import { syncFavoritesWithCatalog } from '../favorite-utils';

const FAVORITES_API = '/api/favorites';

export default function FavoritesPage() {
  const { data: session } = useSession();
  const [favorites, setFavorites] = useState([]);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [cartItems, setCartItems] = useState([]);
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    let active = true;
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    const loadFavorites = async () => {
      let mappedFavorites;
      try {
        const response = await fetch(FAVORITES_API, { cache: 'no-store' });
        if (!response.ok) throw new Error('Não foi possível carregar os favoritos.');
        const { favorites: savedFavorites = [] } = await response.json();
        mappedFavorites = savedFavorites.map((item, index) => ({
          ...item,
          quantity: item.quantity || 1,
          rating: item.rating || '4.8',
          label: index % 2 === 0 ? 'Oferta' : 'Promoção',
          tagClass: index % 2 === 0 ? 'offer' : 'promo',
        }));
      } catch (error) {
        if (active) setFeedback(error.message);
        return;
      }

      if (!active) return;
      setFavorites(mappedFavorites);
      window.dispatchEvent(new CustomEvent('dashboard-favorites-updated', { detail: mappedFavorites.length }));

      try {
        const response = await fetch('/api/products', { cache: 'no-store' });
        const catalog = await response.json();
        if (!response.ok) throw new Error(catalog.error || 'Catálogo indisponível.');
        if (!Array.isArray(catalog.products)) throw new Error('Resposta inválida do catálogo.');
        if (!active) return;
        const currentFavorites = syncFavoritesWithCatalog(mappedFavorites, catalog.products);
        setFavorites(currentFavorites);
        setFeedback('');
      } catch (error) {
        if (active) setFeedback(`Favoritos carregados, mas não foi possível atualizar os dados dos produtos: ${error.message}`);
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
        setFeedback('Não foi possível ler o carrinho salvo neste dispositivo.');
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
  }, [session?.user?.email]);

  const saveCart = async (nextCart) => {
    const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
    const normalizedCart = normalizeCartItems(nextCart);
    setCartItems(normalizedCart);
    localStorage.setItem(cartStorageKey, JSON.stringify(normalizedCart));
    window.dispatchEvent(new CustomEvent('dashboard-cart-updated', { detail: normalizedCart }));
    try {
      const response = await fetch('/api/cart', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: normalizedCart }),
      });
      if (!response.ok) throw new Error('Não foi possível sincronizar o carrinho.');
      setFeedback('');
    } catch (error) {
      setFeedback(`O carrinho foi salvo neste dispositivo, mas não sincronizou: ${error.message}`);
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

  const toggleFavorite = async (name) => {
    const previousFavorites = favorites;
    const nextFavorites = favorites.filter((item) => item.name !== name);
    setFavorites(nextFavorites);
    window.dispatchEvent(new CustomEvent('dashboard-favorites-updated', { detail: nextFavorites.length }));
    try {
      const response = await fetch(FAVORITES_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error('Não foi possível atualizar os favoritos.');
      setFeedback('');
    } catch (error) {
      setFavorites(previousFavorites);
      window.dispatchEvent(new CustomEvent('dashboard-favorites-updated', { detail: previousFavorites.length }));
      setFeedback(error.message);
    }
  };

  const categories = ['Todos', ...new Set(favorites.map((item) => item.category).filter(Boolean))];
  const visibleFavorites = activeCategory === 'Todos' ? favorites : favorites.filter((item) => item.category === activeCategory);

  return (
    <div className="section-shell favorites-showcase">
      <div className="favorites-showcase-header">
        <div className="favorites-title-wrap"><span className="favorites-hero-icon"><Heart size={25} fill="currentColor" /></span><div><span className="favorites-kicker">Sua seleção</span><h1>Seus <em>Favoritos</em></h1><p>Aqui estão os produtos que você marcou como favoritos.<br />Tudo o que você gosta, sempre à mão!</p></div></div>
        <div className="favorites-promo-banner"><div><span><Heart size={14} fill="currentColor" /> Produtos que você ama!</span><small>Mantenha seus favoritos sempre por perto e aproveite ofertas exclusivas.</small><a href="/">Ver ofertas <ArrowRight size={13} /></a></div><span className="favorites-promo-orbit"><ShoppingCart size={33} /></span></div>
      </div>

      {feedback && <p className="favorites-feedback" role="status">{feedback}</p>}
      <div className="favorites-category-tabs" aria-label="Filtrar favoritos">{categories.map((category) => <button key={category} type="button" className={activeCategory === category ? 'active' : ''} onClick={() => setActiveCategory(category)}>{category}</button>)}</div>
      <div className="favorites-showcase-rule"><span>{visibleFavorites.length} {visibleFavorites.length === 1 ? 'produto guardado' : 'produtos guardados'}</span><span>Hoje Supermercado</span></div>

      {favorites.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-box">
            <Heart size={32} />
          </div>
          <h3>Nenhum favorito ainda</h3>
          <p>Você pode salvar produtos para acompanhar ofertas depois.</p>
        </div>
      ) : (
        <div className="favorite-grid favorites-showcase-grid">
          {visibleFavorites.map((item) => (
            <div key={item.name} className="favorite-card">
              <div className="favorite-card-top">
                <span className={`badge-pill ${item.tagClass}`}><Tag size={11} /> {item.label}</span>
                <button type="button" className="icon-button-small heart-filled" aria-label="Desfavoritar produto" aria-pressed="true" onClick={() => toggleFavorite(item.name)}>
                  <Heart size={14} fill="currentColor" />
                </button>
              </div>

              <div className="product-box">
                {item.image ? <img src={item.image} alt={item.name} className="favorite-product-image" /> : <div className="product-icon"><ShoppingCart size={28} /></div>}
              </div>

              <div className="favorite-product-copy">
                <h4>{item.name}</h4>
                <span>{item.category}</span>
              </div>
              <div className="favorite-meta">
                <Star size={12} fill="currentColor" />
                <span>{item.rating}</span>
              </div>

              <div className="price">
                <div><strong>{item.price || 'Preço indisponível'}</strong><small>{item.oldPrice}</small></div>
                <span className="favorite-unit">{item.saleUnit === 'Quilograma' ? 'por kg' : 'por unidade'}</span>
              </div>

              <div className="favorite-card-actions">{cartItems.some((cartItem) => isSameCartProduct(cartItem, item)) ? <div className="favorite-quantity" aria-label={`Quantidade de ${item.name}`}><button type="button" aria-label={`Remover ${item.name} do carrinho`} onClick={() => removeFromCart(item)}><Trash2 size={13} /></button><strong>{formatCartQuantity(cartItems.find((cartItem) => isSameCartProduct(cartItem, item)))}</strong><button type="button" aria-label={`Aumentar ${item.saleUnit === 'Quilograma' ? '100 gramas' : 'quantidade'} de ${item.name}`} onClick={() => addToCart(item)}><Plus size={13} /></button></div> : <button type="button" className="favorite-buy-btn" onClick={() => addToCart(item)}><ShoppingCart size={15} /> {item.saleUnit === 'Quilograma' ? 'Adicionar 100 g' : 'Adicionar'}</button>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
