'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AlertCircle, Package, Pencil, Plus, Search, Trash2 } from 'lucide-react';

const currency = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;

export default function ProductCatalogPage() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('Todas');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [deletingId, setDeletingId] = useState('');

  useEffect(() => {
    let active = true;
    fetch('/api/products', { cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os produtos.');
        if (active) setProducts(data.products || []);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Não foi possível carregar os produtos.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const categories = useMemo(
    () => [...new Set(products.flatMap((product) => product.categories || []))].sort((a, b) => a.localeCompare(b, 'pt-BR')),
    [products],
  );
  const filteredProducts = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('pt-BR');
    return products.filter((product) => {
      const matchesQuery = !normalizedQuery || [
        product.title,
        product.sku,
        product.barcode,
        product.id,
        ...(product.barcodes || []),
      ].some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(normalizedQuery));
      return matchesQuery && (category === 'Todas' || product.categories?.includes(category));
    });
  }, [products, query, category]);

  const deleteProduct = async (product) => {
    if (!window.confirm(`Excluir o produto "${product.title}"? Essa ação será registrada na auditoria e não pode ser desfeita.`)) return;
    setDeletingId(product.id);
    setFeedback('');
    try {
      const response = await fetch('/api/products', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: product.id }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível excluir o produto.');
      setProducts((current) => current.filter((item) => item.id !== product.id));
      setFeedback('Produto excluído. A ação foi registrada na auditoria.');
    } catch (deleteError) {
      setFeedback(deleteError.message || 'Não foi possível excluir o produto.');
    } finally {
      setDeletingId('');
    }
  };

  return <div className="erp-page product-catalog-page">
    <header className="erp-customer-header">
      <div><span className="eyebrow">Catálogo operacional</span><h1>Produtos</h1><p>Busque, consulte e altere produtos já cadastrados. Cada produto deve ter um único cadastro.</p></div>
      <Link href="/erp/catalog" className="primary-cta"><Plus size={16} /> Cadastro de Produto</Link>
    </header>

    <section className="erp-table-panel" aria-label="Catálogo de produtos">
      <div className="erp-table-heading">
        <div><h3>Catálogo operacional</h3><p>{loading ? 'Carregando produtos...' : `${filteredProducts.length.toLocaleString('pt-BR')} de ${products.length.toLocaleString('pt-BR')} produtos`}</p></div>
        <div className="erp-table-tools product-catalog-tools">
          <label className="erp-search"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar produto, SKU, código ou ID" aria-label="Buscar produto, SKU, código de barras ou ID" /></label>
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Filtrar por categoria">
            <option value="Todas">Todas categorias</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </div>
      </div>

      {error && <div className="product-catalog-message error" role="alert"><AlertCircle size={17} /> {error}</div>}
      {feedback && <div className="product-catalog-message">{feedback}</div>}
      {loading && <div className="erp-empty-data">Carregando catálogo...</div>}
      {!loading && !error && !filteredProducts.length && <div className="erp-empty-data"><Package size={20} /> Nenhum produto corresponde à busca.</div>}
      {!loading && !error && filteredProducts.length > 0 && <div className="erp-table-scroll"><table className="erp-table">
        <thead><tr><th>Produto / SKU</th><th>Categorias</th><th>Estoque</th><th>Custo</th><th>Venda</th><th>Margem</th><th>Status</th><th>Ações</th></tr></thead>
        <tbody>{filteredProducts.map((product) => {
          const price = Number(product.price) || 0;
          const cost = Number(product.cost) || 0;
          const margin = price > 0 ? Math.round(((price - cost) / price) * 100) : 0;
          const identity = product.id || product.sku || product.title;
          return <tr key={product.id}>
            <td><strong>{product.title}</strong><small>{product.sku || product.id} · {product.brand || 'Sem marca'}</small></td>
            <td>{product.categories?.join(', ') || '—'}</td>
            <td><strong>{product.quantity || 0}{product.saleUnit === 'Quilograma' ? ' kg' : ''}</strong><small>{product.subcategory || 'Sem subcategoria'}</small></td>
            <td>{currency(cost)}{product.saleUnit === 'Quilograma' ? ' / kg' : ''}</td>
            <td>{currency(price)}{product.saleUnit === 'Quilograma' ? ' / kg' : ''}</td>
            <td>{margin}%</td>
            <td><span className={`erp-status ${String(product.status || '').toLowerCase().replaceAll(' ', '-')}`}>{product.status || '—'}</span></td>
            <td><span className="erp-row-actions">
              <Link href={`/erp/products/cadastro?edit=${encodeURIComponent(identity)}`} className="editor-link" aria-label={`Alterar cadastro de ${product.title}`}><Pencil size={15} /> Alterar</Link>
              <button type="button" className="editor-delete" aria-label={`Excluir ${product.title}`} disabled={deletingId === product.id} onClick={() => deleteProduct(product)}><Trash2 size={15} /></button>
            </span></td>
          </tr>;
        })}</tbody>
      </table></div>}
    </section>
  </div>;
}
