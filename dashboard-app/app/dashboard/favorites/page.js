'use client';

import { ArrowRight, Heart, Plus, ShoppingCart, Star, Tag, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

const FAVORITES_API = '/api/favorites';

export default function FavoritesPage() {
  const [favorites, setFavorites] = useState([]);
  const [activeCategory, setActiveCategory] = useState('Todos');
  const [cartItems, setCartItems] = useState([]);

  useEffect(() => {
    fetch(FAVORITES_API)
      .then((response) => response.json())
      .then(({ favorites: savedFavorites = [] }) => setFavorites(savedFavorites.map((item, index) => ({
        ...item,
        quantity: item.quantity || 1,
        rating: item.rating || '4.8',
        label: index % 2 === 0 ? 'Oferta' : 'Promoção',
        tagClass: index % 2 === 0 ? 'offer' : 'promo',
      }))))
      .catch(() => setFavorites([]));
    fetch('/api/cart').then((response) => response.json()).then(({ cart = [] }) => setCartItems(cart)).catch(() => setCartItems([]));
  }, []);

  const removeFromCart = async (name) => {
    const nextCart = cartItems.filter((item) => item.name !== name);
    setCartItems(nextCart);
    await fetch('/api/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart: nextCart }) });
    window.dispatchEvent(new Event('dashboard-cart-updated'));
  };

  const addToCart = async (item) => {
    const response = await fetch('/api/cart');
    const { cart: currentCart = [] } = await response.json();
    const existing = currentCart.find((cartItem) => cartItem.name === item.name);
    const nextCart = existing
      ? currentCart.map((cartItem) => cartItem.name === item.name ? { ...cartItem, quantity: (cartItem.quantity || 1) + 1 } : cartItem)
      : [...currentCart, { name: item.name, category: item.category, price: item.price, quantity: 1 }];
    await fetch('/api/cart', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ cart: nextCart }) });
    setCartItems(nextCart);
    window.dispatchEvent(new Event('dashboard-cart-updated'));
  };

  const toggleFavorite = async (name) => {
    const previousFavorites = favorites;
    setFavorites((current) => current.filter((item) => item.name !== name));
    try {
      const response = await fetch(FAVORITES_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name }) });
      if (!response.ok) throw new Error('Não foi possível atualizar os favoritos.');
    } catch {
      setFavorites(previousFavorites);
    }
  };

  const clearFavorites = () => {
    favorites.forEach((item) => fetch(FAVORITES_API, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: item.name }) }));
    setFavorites([]);
  };

  const categories = ['Todos', ...new Set(favorites.map((item) => item.category).filter(Boolean))];
  const visibleFavorites = activeCategory === 'Todos' ? favorites : favorites.filter((item) => item.category === activeCategory);

  return (
    <div className="section-shell favorites-showcase">
      <div className="favorites-showcase-header">
        <div className="favorites-title-wrap"><span className="favorites-hero-icon"><Heart size={25} fill="currentColor" /></span><div><span className="favorites-kicker">Sua seleção</span><h1>Seus <em>Favoritos</em></h1><p>Aqui estão os produtos que você marcou como favoritos.<br />Tudo o que você gosta, sempre à mão!</p></div></div>
        <div className="favorites-promo-banner"><div><span><Heart size={14} fill="currentColor" /> Produtos que você ama!</span><small>Mantenha seus favoritos sempre por perto e aproveite ofertas exclusivas.</small><a href="http://localhost:5500/">Ver ofertas <ArrowRight size={13} /></a></div><span className="favorites-promo-orbit"><ShoppingCart size={33} /></span></div>
      </div>

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
                <span className="favorite-unit">por unidade</span>
              </div>

              <div className="favorite-card-actions">{cartItems.some((cartItem) => cartItem.name === item.name) ? <div className="favorite-quantity" aria-label={`Quantidade de ${item.name}`}><button type="button" aria-label="Remover do carrinho" onClick={() => removeFromCart(item.name)}><Trash2 size={13} /></button><strong>{cartItems.find((cartItem) => cartItem.name === item.name)?.quantity || 1}</strong><button type="button" aria-label="Aumentar quantidade" onClick={() => addToCart(item)}><Plus size={13} /></button></div> : <button type="button" className="favorite-buy-btn" onClick={() => addToCart(item)}><ShoppingCart size={15} /> Comprar</button>}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
