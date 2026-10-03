'use client';

import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, PackagePlus, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { expiryDateFromShelfLife } from '../api/inventory-lots.js';
import InventoryLotFormFields, { createEmptyLotForm, emptyLotForm } from '../components/inventory-lot-form-fields.js';
import styles from './expiry-page.module.css';

export default function RegisterLotPage() {
  const [products, setProducts] = useState([]);
  const [lotForm, setLotForm] = useState(emptyLotForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [feedback, setFeedback] = useState('');

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/erp/validade', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os produtos.');
      if (!Array.isArray(data.products)) throw new Error('A resposta de produtos está inválida.');
      setProducts(data.products);

      const requestedProductId = new URLSearchParams(window.location.search).get('productId');
      if (requestedProductId) {
        const product = data.products.find((item) => item.id === requestedProductId || item.externalId === requestedProductId);
        if (!product) throw new Error('O produto informado não foi encontrado. Selecione outro produto para registrar o lote.');
        setLotForm(createEmptyLotForm(product));
      }
    } catch (loadError) {
      console.error('Não foi possível carregar os produtos para registrar o lote:', loadError);
      setError(loadError.message || 'Não foi possível carregar os produtos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadProducts(); }, [loadProducts]);

  const selectedProduct = products.find((product) => product.id === lotForm.productId);
  const calculatedExpiry = expiryDateFromShelfLife(lotForm.manufactureDate, lotForm.shelfLifeDays);
  const effectiveExpiry = lotForm.expiryMode === 'days' ? calculatedExpiry : lotForm.expiry;

  const saveLot = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    setFeedback('');
    try {
      const response = await fetch('/api/erp/validade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          productId: lotForm.productId,
          lotCode: lotForm.lotCode,
          quantity: Number(lotForm.quantity),
          expiry: effectiveExpiry,
          manufactureDate: lotForm.manufactureDate,
          expiryMode: lotForm.expiryMode,
          shelfLifeDays: lotForm.expiryMode === 'days' ? lotForm.shelfLifeDays : null,
          location: lotForm.location,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível registrar o lote.');
      if (!data.product) throw new Error('O lote foi salvo, mas a resposta do produto está inválida. Atualize os dados antes de continuar.');

      setProducts((current) => current.map((product) => product.id === data.product.id ? data.product : product));
      setLotForm(createEmptyLotForm(data.product));
      setFeedback(`Lote registrado. O saldo de ${data.product.title} foi atualizado.`);
    } catch (saveError) {
      console.error('Não foi possível registrar o lote de estoque:', saveError);
      setFormError(saveError.message || 'Não foi possível registrar o lote.');
    } finally {
      setSaving(false);
    }
  };

  const retryAction = useMemo(() => (
    <button className={styles.refreshButton} type="button" onClick={loadProducts} disabled={loading}>
      <RefreshCw size={16} aria-hidden="true" />{loading ? 'Carregando...' : 'Tentar novamente'}
    </button>
  ), [loadProducts, loading]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.eyebrow}>Operação · Estoque</span>
          <h1>Registrar lote</h1>
          <p>Registre uma nova entrada de estoque com quantidade, código e validade próprios.</p>
        </div>
        <div className={styles.headerActions}>
          <Link className={styles.refreshButton} href="/erp/validade">
            <ArrowLeft size={16} aria-hidden="true" /> Controle de Validade
          </Link>
        </div>
      </header>

      {feedback && <div className={styles.feedbackMessage} role="status"><CheckCircle2 size={17} aria-hidden="true" />{feedback}<button type="button" onClick={() => setFeedback('')} aria-label="Fechar aviso"><X size={15} /></button></div>}

      {error && <div className={styles.errorMessage} role="alert"><AlertTriangle size={18} aria-hidden="true" /><span>{error}</span>{retryAction}</div>}
      {loading && !error && <div className={styles.emptyState} role="status">Carregando produtos...</div>}
      {!loading && !error && !products.length && <div className={styles.emptyState}>
        <PackagePlus size={24} aria-hidden="true" />
        <h3>Nenhum produto cadastrado</h3>
        <p>Cadastre um produto antes de registrar uma entrada de lote.</p>
        <Link href="/erp/catalog">Cadastrar produto</Link>
      </div>}

      {!loading && !error && products.length > 0 && <section className={styles.registerPanel} aria-labelledby="register-lot-form-title">
        <header className={styles.registerPanelHeading}>
          <h2 id="register-lot-form-title">Dados da entrada</h2>
          <p>Se o produto, código do lote e datas já estiverem cadastrados, a quantidade será somada ao lote existente.</p>
        </header>
        <form className={styles.lotForm} onSubmit={saveLot}>
          <InventoryLotFormFields
            products={products}
            lotForm={lotForm}
            setLotForm={setLotForm}
            selectedProduct={selectedProduct}
            effectiveExpiry={effectiveExpiry}
            formError={formError}
          />
          <footer className={`${styles.dialogActions} ${styles.formWide}`}>
            <Link className={styles.refreshButton} href="/erp/validade">Cancelar</Link>
            <button type="submit" className={styles.addButton} disabled={saving || !selectedProduct}>
              {saving ? 'Salvando...' : 'Registrar entrada'}
            </button>
          </footer>
        </form>
      </section>}
    </div>
  );
}
