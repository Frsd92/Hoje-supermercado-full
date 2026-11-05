'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  AlertCircle,
  Check,
  ChevronRight,
  ListPlus,
  LoaderCircle,
  Minus,
  Plus,
  RotateCcw,
  Search,
  ShoppingBasket,
  Trash2,
} from 'lucide-react';
import { getOrderStatus } from '@/app/dashboard/order-status';
import { adjustCartQuantity, normalizeCartItems } from '@/app/dashboard/cart-utils';
import { searchShoppingProducts } from '@/features/shopping/product-search';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const dateFormatter = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });

function requestError(data, fallback) {
  return typeof data?.error === 'string' ? data.error : fallback;
}

function productForOrderItem(item, products) {
  const identifier = String(item?.productId || '').trim();
  return products.find((product) => (
    String(product.catalogId) === identifier || String(product.id) === identifier
  ));
}

function orderDate(order) {
  const date = new Date(order.createdAtIso || order.createdAt || '');
  return Number.isNaN(date.getTime()) ? 'Data indisponível' : dateFormatter.format(date);
}

function currentProductPrice(product) {
  const amount = Number(product.salePrice ?? product.price ?? 0);
  return currency.format(Number.isFinite(amount) ? amount : 0);
}

function cartItemForProduct(product, quantity) {
  const price = Number(product.salePrice ?? product.price ?? 0);
  const saleUnit = product.saleUnit === 'Quilograma' ? 'Quilograma' : 'Unidade';
  return {
    productId: product.id,
    name: product.title,
    category: product.categories?.[0] || '',
    price: `${currency.format(Number.isFinite(price) ? price : 0)}${saleUnit === 'Quilograma' ? ' / kg' : ''}`,
    image: product.image || '',
    quantity,
    saleUnit,
  };
}

function initialQuantity(product) {
  return product.saleUnit === 'Quilograma' ? 0.1 : 1;
}

function isProductAvailable(product) {
  const minimumQuantity = product.saleUnit === 'Quilograma' ? 0.1 : 1;
  return Number(product.availableQuantity) >= minimumQuantity;
}

function stockLimitedQuantity(product, requested, current = 0) {
  const stock = Number(product.availableQuantity) || 0;
  const total = Math.min(stock, current + requested);
  return product.saleUnit === 'Quilograma'
    ? Math.max(0, Math.floor(total * 10) / 10)
    : Math.max(0, Math.floor(total));
}

export default function ShoppingPage({ mode = 'all' }) {
  const { data: session, status } = useSession();
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [lists, setLists] = useState([]);
  const [cart, setCart] = useState([]);
  const [selectedListId, setSelectedListId] = useState('');
  const [search, setSearch] = useState('');
  const [newListName, setNewListName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const [savingList, setSavingList] = useState(false);
  const [cartBusy, setCartBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selectedList = lists.find((list) => list.id === selectedListId) || null;
  const showReorder = mode === 'all' || mode === 'reorder';
  const showLists = mode === 'all' || mode === 'lists';

  const loadData = useCallback(async () => {
    if (status !== 'authenticated') return;
    setLoading(true);
    setLoadError('');
    try {
      const endpoints = [
        ['/api/my/orders', 'Não foi possível carregar suas compras anteriores.'],
        ['/api/products?purpose=shopping', 'Não foi possível consultar os produtos disponíveis.'],
        ['/api/shopping-lists', 'Não foi possível carregar suas listas.'],
        ['/api/cart', 'Não foi possível carregar seu carrinho.'],
      ];
      const results = await Promise.all(endpoints.map(async ([url, fallback]) => {
        const response = await fetch(url, { cache: 'no-store', credentials: 'include' });
        const data = await response.json();
        if (!response.ok) throw new Error(requestError(data, fallback));
        return data;
      }));
      if (!Array.isArray(results[0].orders) || !Array.isArray(results[1].products)
        || !Array.isArray(results[2].lists) || !Array.isArray(results[3].cart)) {
        throw new Error('Os dados recebidos estão incompletos. Tente novamente.');
      }
      setOrders(results[0].orders);
      setProducts(results[1].products);
      setLists(results[2].lists);
      setSelectedListId((current) => current && results[2].lists.some((list) => list.id === current)
        ? current
        : results[2].lists[0]?.id || '');
      const cartStorageKey = `hoje-dashboard-cart-${session?.user?.email || 'guest'}`;
      const savedCart = normalizeCartItems(results[3].cart);
      setCart(savedCart);
      localStorage.setItem(cartStorageKey, JSON.stringify(savedCart));
    } catch (error) {
      console.error('Não foi possível carregar a área de recompra e listas:', error);
      setLoadError(error.message || 'Não foi possível carregar seus dados agora.');
    } finally {
      setLoading(false);
    }
  }, [session?.user?.email, status]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!selectedList) {
      setRenameValue('');
      return;
    }
    setRenameValue(selectedList.name);
  }, [selectedList?.id, selectedList?.name]);

  const eligibleOrders = useMemo(() => orders.filter((order) => (
    getOrderStatus(order.status).tone !== 'cancelled'
  )).slice(0, 5), [orders]);

  const searchResults = useMemo(() => {
    return searchShoppingProducts(products, search);
  }, [products, search]);

  async function sendListRequest(method, body, query = '') {
    const response = await fetch(`/api/shopping-lists${query}`, {
      method,
      credentials: 'include',
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await response.json();
    if (!response.ok) throw new Error(requestError(data, 'Não foi possível atualizar sua lista.'));
    return data;
  }

  async function createList(items = [], suggestedName = '') {
    const name = (suggestedName || newListName).trim();
    if (!name) {
      setActionError('Dê um nome para sua lista.');
      return null;
    }
    setSavingList(true);
    setActionError('');
    setNotice('');
    try {
      const data = await sendListRequest('POST', { name, items });
      setLists((current) => [data.list, ...current]);
      setSelectedListId(data.list.id);
      setNewListName('');
      setNotice(`Lista “${data.list.name}” criada.`);
      return data.list;
    } catch (error) {
      setActionError(error.message);
      return null;
    } finally {
      setSavingList(false);
    }
  }

  async function updateList(list, changes) {
    setSavingList(true);
    setActionError('');
    setNotice('');
    try {
      const data = await sendListRequest('PATCH', { id: list.id, ...changes });
      setLists((current) => current.map((item) => item.id === data.list.id ? data.list : item));
      setNotice('Lista atualizada.');
      return data.list;
    } catch (error) {
      setActionError(error.message);
      return null;
    } finally {
      setSavingList(false);
    }
  }

  async function deleteSelectedList() {
    if (!selectedList) return;
    setSavingList(true);
    setActionError('');
    setNotice('');
    try {
      await sendListRequest('DELETE', null, `?id=${encodeURIComponent(selectedList.id)}`);
      const remaining = lists.filter((list) => list.id !== selectedList.id);
      setLists(remaining);
      setSelectedListId(remaining[0]?.id || '');
      setConfirmDelete(false);
      setNotice('Lista excluída.');
    } catch (error) {
      setActionError(error.message);
    } finally {
      setSavingList(false);
    }
  }

  async function saveCart(nextCart, successMessage) {
    setCartBusy(true);
    setActionError('');
    setNotice('');
    const normalized = normalizeCartItems(nextCart);
    try {
      const response = await fetch('/api/cart', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cart: normalized }),
      });
      const data = await response.json();
      if (!response.ok || !Array.isArray(data.cart)) {
        throw new Error(requestError(data, 'Não foi possível atualizar seu carrinho.'));
      }
      const savedCart = normalizeCartItems(data.cart);
      setCart(savedCart);
      localStorage.setItem(`hoje-dashboard-cart-${session?.user?.email || 'guest'}`, JSON.stringify(savedCart));
      window.dispatchEvent(new CustomEvent('dashboard-cart-updated', { detail: savedCart }));
      setNotice(successMessage);
    } catch (error) {
      console.error('Não foi possível salvar o carrinho a partir das listas:', error);
      setActionError(error.message);
    } finally {
      setCartBusy(false);
    }
  }

  function getOrderProducts(order) {
    return (Array.isArray(order.items) ? order.items : []).map((item) => ({
      item,
      product: productForOrderItem(item, products),
    }));
  }

  async function addOrderToCart(order) {
    let updated = [...cart];
    let added = 0;
    for (const { item, product } of getOrderProducts(order)) {
      if (!product) continue;
      const existing = updated.find((cartItem) => String(cartItem.productId || cartItem.id) === String(product.id));
      const current = Number(existing?.quantity) || 0;
      const requested = Math.max(initialQuantity(product), Number(item.quantity) || initialQuantity(product));
      const quantity = stockLimitedQuantity(product, requested, current);
      if (quantity <= current) continue;
      const line = cartItemForProduct(product, quantity);
      updated = existing
        ? updated.map((cartItem) => cartItem === existing ? { ...cartItem, ...line } : cartItem)
        : [...updated, line];
      added += 1;
    }
    await saveCart(updated, added
      ? `${added} ${added === 1 ? 'produto disponível foi adicionado' : 'produtos disponíveis foram adicionados'} ao carrinho com os preços atuais.`
      : 'Nenhum item disponível para adicionar. Seu carrinho não foi alterado.');
  }

  async function saveOrderAsList(order) {
    const items = getOrderProducts(order)
      .filter(({ product }) => product)
      .map(({ item, product }) => ({
        productId: product.id,
        quantity: Math.max(initialQuantity(product), Number(item.quantity) || initialQuantity(product)),
        saleUnit: product.saleUnit,
      }));
    if (!items.length) {
      setActionError('Esta compra não tem itens disponíveis para salvar em uma lista.');
      return;
    }
    const name = `Compra de ${orderDate(order)}`;
    await createList(items, name);
  }

  async function addProductToList(product) {
    if (!selectedList) {
      setActionError('Crie ou selecione uma lista antes de adicionar produtos.');
      return;
    }
    const existing = selectedList.items.find((item) => item.productId === product.id);
    const quantity = existing
      ? adjustCartQuantity(existing.quantity, 1, product.saleUnit)
      : initialQuantity(product);
    const nextItems = existing
      ? selectedList.items.map((item) => item.productId === product.id ? { ...item, quantity } : item)
      : [...selectedList.items, { productId: product.id, quantity, saleUnit: product.saleUnit }];
    if (quantity <= (existing?.quantity || 0)) {
      setActionError('A lista já contém a quantidade máxima disponível deste produto.');
      return;
    }
    setSearch('');
    await updateList(selectedList, { items: nextItems });
  }

  async function changeListItemQuantity(listItem, delta) {
    if (!selectedList) return;
    const product = products.find((item) => item.id === listItem.productId);
    if (!product) return;
    const requested = adjustCartQuantity(listItem.quantity, delta, product.saleUnit);
    const nextItems = selectedList.items.map((item) => item.productId === listItem.productId
      ? { ...item, quantity: requested }
      : item);
    await updateList(selectedList, { items: nextItems });
  }

  async function removeListItem(productId) {
    if (!selectedList) return;
    await updateList(selectedList, {
      items: selectedList.items.filter((item) => item.productId !== productId),
    });
  }

  async function addListToCart() {
    if (!selectedList) return;
    let updated = [...cart];
    let added = 0;
    for (const item of selectedList.items) {
      const product = products.find((candidate) => candidate.id === item.productId);
      if (!product) continue;
      const existing = updated.find((cartItem) => String(cartItem.productId || cartItem.id) === String(product.id));
      const current = Number(existing?.quantity) || 0;
      const quantity = stockLimitedQuantity(product, Number(item.quantity), current);
      if (quantity <= current) continue;
      const line = cartItemForProduct(product, quantity);
      updated = existing
        ? updated.map((cartItem) => cartItem === existing ? { ...cartItem, ...line } : cartItem)
        : [...updated, line];
      added += 1;
    }
    await saveCart(updated, added
      ? `${added} ${added === 1 ? 'produto disponível foi adicionado' : 'produtos disponíveis foram adicionados'} ao carrinho.`
      : 'Nenhum item disponível para adicionar. Confira os produtos indisponíveis da lista.');
  }

  if (status === 'loading' || loading) {
    return <main className="shopping-hub"><div className="shopping-loading" role="status"><LoaderCircle size={20} className="shopping-spin" /> Carregando suas compras e listas…</div></main>;
  }

  if (loadError) {
    return <main className="shopping-hub"><div className="shopping-alert" role="alert"><AlertCircle size={20} /><span>{loadError}</span><button type="button" onClick={loadData}>Tentar novamente</button></div></main>;
  }

  return (
    <main className="shopping-hub">
      <header className="shopping-hero">
        <div className="shopping-hero-icon" aria-hidden="true">{mode === 'lists' ? <ListPlus size={25} /> : mode === 'reorder' ? <RotateCcw size={25} /> : <ShoppingBasket size={25} />}</div>
        <div>
          <p className="shopping-eyebrow">Praticidade para sua rotina</p>
          <h1 id="shopping-page-title">{mode === 'lists' ? 'Listas de compras' : mode === 'reorder' ? 'Comprar novamente' : 'Suas compras, do seu jeito'}</h1>
          <p>{mode === 'lists'
            ? 'Organize seus produtos favoritos e deixe sua próxima compra mais rápida.'
            : mode === 'reorder'
              ? 'Repita uma compra anterior com produtos, preços e estoque atualizados.'
              : 'Repita uma compra anterior ou monte listas para ter tudo pronto na próxima visita.'}</p>
        </div>
      </header>

      <nav className="shopping-shortcuts" aria-label="Outras ferramentas de compra">
        {(mode === 'all' || mode === 'lists') && <Link href="/dashboard/reorder"><RotateCcw size={17} /> Ver compras anteriores <ChevronRight size={16} /></Link>}
        {(mode === 'all' || mode === 'reorder') && <Link href="/dashboard/lists"><ListPlus size={18} /> Abrir listas de compras <ChevronRight size={16} /></Link>}
      </nav>

      {(actionError || notice) && (
        <div className={actionError ? 'shopping-alert' : 'shopping-notice'} role={actionError ? 'alert' : 'status'}>
          {actionError ? <AlertCircle size={18} aria-hidden="true" /> : <Check size={18} aria-hidden="true" />}
          <span>{actionError || notice}</span>
          {actionError && <button type="button" className="shopping-dismiss" onClick={() => setActionError('')} aria-label="Fechar mensagem"><span aria-hidden="true">×</span></button>}
        </div>
      )}

      {showReorder && <section id="reorder" className={`shopping-section${mode === 'reorder' ? ' shopping-section-focus' : ''}`} aria-labelledby={mode === 'reorder' ? 'shopping-page-title' : 'reorder-title'}>
        {mode === 'all' && <div className="shopping-section-heading">
          <div className="shopping-section-icon" aria-hidden="true"><RotateCcw size={20} /></div>
          <div>
            <p className="shopping-eyebrow">Menos etapas, mais tempo para você</p>
            <h2 id="reorder-title">Comprar novamente</h2>
            <p>Produtos e valores são atualizados conforme o catálogo e o estoque de hoje.</p>
          </div>
        </div>}

        {eligibleOrders.length === 0 ? (
          <div className="shopping-empty">
            <ShoppingBasket size={24} aria-hidden="true" />
            <h3>Suas compras anteriores aparecerão aqui</h3>
            <p>Assim que você fizer um pedido, poderá adicionar os itens disponíveis ao carrinho com poucos toques.</p>
          </div>
        ) : (
          <div className="shopping-orders">
            {eligibleOrders.map((order) => {
              const resolvedItems = getOrderProducts(order);
              const availableCount = resolvedItems.filter(({ product }) => product && isProductAvailable(product)).length;
              const catalogItemCount = resolvedItems.filter(({ product }) => product).length;
              return (
                <article className="shopping-order-card" key={order.id}>
                  <div className="shopping-order-top">
                    <div>
                      <p className="shopping-order-kicker">Compra de {orderDate(order)}</p>
                      <p className="shopping-order-meta">{resolvedItems.length} {resolvedItems.length === 1 ? 'item' : 'itens'} <span aria-hidden="true">·</span> {order.total || ''}</p>
                    </div>
                    <span className="shopping-order-status">{getOrderStatus(order.status).label}</span>
                  </div>
                  <ul className="shopping-order-items" aria-label={`Itens da compra de ${orderDate(order)}`}>
                    {resolvedItems.slice(0, 4).map(({ item, product }, index) => (
                      <li key={`${item.productId || item.name}-${index}`} className={product && isProductAvailable(product) ? '' : 'is-unavailable'}>
                        <span className="shopping-item-dot" aria-hidden="true">{product && isProductAvailable(product) ? <Check size={13} /> : <AlertCircle size={13} />}</span>
                        <span className="shopping-item-title">{product?.title || item.name || 'Produto indisponível'}</span>
                        <span className="shopping-item-price">{product && isProductAvailable(product) ? currentProductPrice(product) : 'Sem estoque'}</span>
                      </li>
                    ))}
                    {resolvedItems.length > 4 && <li className="shopping-more-items">+ {resolvedItems.length - 4} outros itens</li>}
                  </ul>
                  <div className="shopping-order-actions">
                    <button type="button" className="shopping-button shopping-button-primary" onClick={() => addOrderToCart(order)} disabled={!availableCount || cartBusy}>
                      {cartBusy ? <LoaderCircle size={16} className="shopping-spin" /> : <ShoppingBasket size={16} />}
                      Adicionar disponíveis
                    </button>
                    <button type="button" className="shopping-button shopping-button-secondary" onClick={() => saveOrderAsList(order)} disabled={!catalogItemCount || savingList}>
                      <ListPlus size={16} /> Salvar como lista
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>}

      {showLists && <section id="lists" className={`shopping-section shopping-lists-section${mode === 'lists' ? ' shopping-section-focus' : ''}`} aria-labelledby={mode === 'lists' ? 'shopping-page-title' : 'lists-title'}>
        {mode === 'all' && <div className="shopping-section-heading">
          <div className="shopping-section-icon" aria-hidden="true"><ListPlus size={21} /></div>
          <div>
            <p className="shopping-eyebrow">Organize o que não pode faltar</p>
            <h2 id="lists-title">Listas de compras</h2>
            <p>Monte listas para sua casa, receitas ou próximas compras. Elas ficam salvas na sua conta.</p>
          </div>
        </div>}

        <form className="shopping-create-form" onSubmit={(event) => { event.preventDefault(); createList(); }}>
          <label className="shopping-sr-only" htmlFor="shopping-list-name">Nome da nova lista</label>
          <input
            id="shopping-list-name"
            type="text"
            value={newListName}
            onChange={(event) => setNewListName(event.target.value)}
            placeholder="Ex.: Feira da semana"
            maxLength={60}
            required
          />
          <button type="submit" className="shopping-button shopping-button-primary" disabled={savingList || lists.length >= 30}>
            {savingList ? <LoaderCircle size={16} className="shopping-spin" /> : <Plus size={17} />}
            Criar lista
          </button>
          <span className="shopping-create-hint">{lists.length}/30 listas</span>
        </form>

        {lists.length === 0 ? (
          <div className="shopping-empty shopping-empty-compact">
            <ListPlus size={23} aria-hidden="true" />
            <h3>Comece sua primeira lista</h3>
            <p>Dê um nome acima e adicione os produtos que você compra com frequência.</p>
          </div>
        ) : (
          <div className="shopping-list-workspace">
            <div className="shopping-list-picker" role="group" aria-label="Suas listas de compras">
              {lists.map((list) => (
                <button
                  type="button"
                  key={list.id}
                  className={`shopping-list-tab${selectedListId === list.id ? ' is-selected' : ''}`}
                  onClick={() => { setSelectedListId(list.id); setConfirmDelete(false); }}
                  aria-pressed={selectedListId === list.id}
                >
                  <span>{list.name}</span>
                  <small>{list.items.length} {list.items.length === 1 ? 'item' : 'itens'}</small>
                </button>
              ))}
            </div>

            {selectedList && (
              <div className="shopping-list-detail">
                <div className="shopping-list-detail-heading">
                  <div>
                    <p className="shopping-eyebrow">Sua lista selecionada</p>
                    <form className="shopping-rename-form" onSubmit={(event) => { event.preventDefault(); updateList(selectedList, { name: renameValue }); }}>
                      <label className="shopping-sr-only" htmlFor="shopping-list-rename">Renomear lista</label>
                      <input id="shopping-list-rename" value={renameValue} maxLength={60} onChange={(event) => setRenameValue(event.target.value)} />
                      <button type="submit" className="shopping-text-button" disabled={savingList || renameValue.trim() === selectedList.name}>Salvar nome</button>
                    </form>
                  </div>
                  {!confirmDelete ? (
                    <button type="button" className="shopping-delete-button" onClick={() => setConfirmDelete(true)} aria-label={`Excluir a lista ${selectedList.name}`}>
                      <Trash2 size={16} /><span>Excluir lista</span>
                    </button>
                  ) : (
                    <div className="shopping-delete-confirm" role="group" aria-label={`Confirmar exclusão de ${selectedList.name}`}>
                      <span>Excluir esta lista?</span>
                      <button type="button" onClick={deleteSelectedList} disabled={savingList}>Sim</button>
                      <button type="button" onClick={() => setConfirmDelete(false)}>Não</button>
                    </div>
                  )}
                </div>

                <div className="shopping-product-search">
                  <label htmlFor="shopping-product-search"><Search size={17} aria-hidden="true" /> Adicionar produtos à lista</label>
                  <input
                    id="shopping-product-search"
                    type="search"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Busque pelo nome do produto"
                    autoComplete="off"
                  />
                  {searchResults.length > 0 && (
                    <ul className="shopping-search-results" aria-label="Resultados de produtos">
                      {searchResults.map((product) => (
                        <li key={product.id}>
                          <span><strong>{product.title}</strong><small>{isProductAvailable(product) ? `${currentProductPrice(product)}${product.saleUnit === 'Quilograma' ? ' / kg' : ''}` : 'Sem estoque no momento · pode salvar na lista'}</small></span>
                          <button type="button" onClick={() => addProductToList(product)} disabled={savingList} aria-label={`Adicionar ${product.title} à lista`}>
                            <Plus size={17} /><span>Adicionar</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {search.trim().length > 0 && searchResults.length === 0 && <p className="shopping-search-hint">Nenhum produto encontrado no catálogo.</p>}
                </div>

                <ul className="shopping-list-items">
                  {selectedList.items.length === 0 ? (
                    <li className="shopping-list-empty">Esta lista ainda não tem produtos. Busque acima para adicionar.</li>
                  ) : selectedList.items.map((item) => {
                    const product = products.find((candidate) => candidate.id === item.productId);
                    return (
                      <li key={item.productId} className={!product || !isProductAvailable(product) ? 'is-unavailable' : ''}>
                        <div className="shopping-list-product-name">
                          <strong>{product?.title || 'Produto indisponível'}</strong>
                          <small>{product ? `${currentProductPrice(product)}${product.saleUnit === 'Quilograma' ? ' / kg' : ''}${isProductAvailable(product) ? '' : ' · Sem estoque no momento'}` : 'Fora do catálogo'}</small>
                        </div>
                        {product ? (
                          <div className="shopping-quantity-control" aria-label={`Quantidade de ${product.title}`}>
                            <button type="button" onClick={() => changeListItemQuantity(item, -1)} disabled={savingList || item.quantity <= (product.saleUnit === 'Quilograma' ? 0.1 : 1)} aria-label={`Diminuir ${product.title}`}><Minus size={15} /></button>
                            <span>{product.saleUnit === 'Quilograma' ? `${Number(item.quantity).toLocaleString('pt-BR')} kg` : item.quantity}</span>
                            <button type="button" onClick={() => changeListItemQuantity(item, 1)} disabled={savingList || item.quantity >= 9999} aria-label={`Aumentar ${product.title}`}><Plus size={15} /></button>
                          </div>
                        ) : <span className="shopping-unavailable-label">Indisponível</span>}
                        <button type="button" className="shopping-remove-item" onClick={() => removeListItem(item.productId)} disabled={savingList} aria-label={`Remover ${product?.title || 'produto'} da lista`}>
                          <Trash2 size={16} />
                        </button>
                      </li>
                    );
                  })}
                </ul>

                <div className="shopping-list-footer">
                  <p>{selectedList.items.length} {selectedList.items.length === 1 ? 'produto na lista' : 'produtos na lista'}{selectedList.items.length ? ' · preços atualizados no carrinho' : ''}</p>
                  <button type="button" className="shopping-button shopping-button-primary" onClick={addListToCart} disabled={!selectedList.items.some((item) => products.some((product) => product.id === item.productId && isProductAvailable(product))) || cartBusy}>
                    {cartBusy ? <LoaderCircle size={16} className="shopping-spin" /> : <ShoppingBasket size={16} />}
                    Adicionar disponíveis ao carrinho
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </section>}
    </main>
  );
}
