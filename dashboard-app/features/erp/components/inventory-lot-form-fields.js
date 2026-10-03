'use client';

import styles from '../pages/expiry-page.module.css';
import { matchesProductSearch } from '../api/product-search.js';

export const emptyLotForm = {
  productId: '',
  lotCode: '',
  quantity: '',
  expiry: '',
  manufactureDate: '',
  expiryMode: 'date',
  shelfLifeDays: '',
  location: '',
};

export function createEmptyLotForm(product) {
  const shelfLifeDays = product?.shelfLifeDays ? String(product.shelfLifeDays) : '';
  return {
    ...emptyLotForm,
    productId: String(product?.id || ''),
    shelfLifeDays,
    expiryMode: shelfLifeDays ? 'days' : 'date',
    location: product?.location || '',
  };
}

export function formatExpiryDate(value) {
  if (!value) return 'Sem data cadastrada';
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return 'Data inválida';
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'medium' }).format(date);
}

export default function InventoryLotFormFields({
  products,
  lotForm,
  setLotForm,
  selectedProduct,
  selectableProducts = products,
  productSearch,
  onProductSearchChange,
  searchResultCount,
  effectiveExpiry,
  editingLot = false,
  formError = '',
}) {
  const updateField = (field, value) => {
    setLotForm((current) => ({ ...current, [field]: value }));
  };

  const selectProduct = (event) => {
    const product = products.find((item) => item.id === event.target.value);
    setLotForm(createEmptyLotForm(product));
  };

  return <>
    {onProductSearchChange && <label className={styles.formWide}>
      Buscar produto
      <input
        type="search"
        value={productSearch}
        onChange={(event) => onProductSearchChange(event.target.value)}
        placeholder="Nome, código de barras, SKU, categoria ou departamento"
        autoComplete="off"
        aria-describedby="register-lot-product-search-results"
      />
      <small id="register-lot-product-search-results" role="status" aria-live="polite">
        {searchResultCount} {searchResultCount === 1 ? 'produto encontrado' : 'produtos encontrados'}
        {searchResultCount === 0 && lotForm.productId ? '. O produto selecionado continua disponível.' : '.'}
      </small>
    </label>}
    <label className={styles.formWide}>
      Produto
      <select value={lotForm.productId} onChange={selectProduct} required disabled={Boolean(editingLot)}>
        <option value="">Selecione um produto</option>
        {selectableProducts.map((product) => {
          const isSelectedOutsideResults = String(product.id) === lotForm.productId
            && productSearch?.trim()
            && !matchesProductSearch(product, productSearch);
          return <option key={product.id} value={product.id}>
            {isSelectedOutsideResults ? 'Produto selecionado · ' : ''}{product.title} · {product.sku || product.externalId}
          </option>;
        })}
      </select>
      {selectedProduct && <small>Saldo agregado atual: {Number(selectedProduct.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {selectedProduct.saleUnit}</small>}
    </label>
    <label>
      Código do lote{selectedProduct?.controlsLot ? ' (obrigatório)' : ''}
      <input value={lotForm.lotCode} onChange={(event) => updateField('lotCode', event.target.value)} required={selectedProduct?.controlsLot === true && Number(lotForm.quantity) > 0} autoComplete="off" />
    </label>
    <label>
      {editingLot ? 'Saldo físico atual' : 'Quantidade recebida'} ({selectedProduct?.saleUnit || 'un.'})
      <input type="number" inputMode="decimal" min={editingLot ? '0' : '0.001'} step="0.001" value={lotForm.quantity} onChange={(event) => updateField('quantity', event.target.value)} required />
    </label>
    <fieldset className={`${styles.expiryModeFieldset} ${styles.formWide}`}>
      <legend>Como informar a validade</legend>
      <div className={styles.expiryModeOptions}>
        <label><input type="radio" name="expiryMode" value="days" checked={lotForm.expiryMode === 'days'} onChange={() => updateField('expiryMode', 'days')} /> Calcular pela fabricação e dias</label>
        <label><input type="radio" name="expiryMode" value="date" checked={lotForm.expiryMode === 'date'} onChange={() => updateField('expiryMode', 'date')} /> Informar data manualmente</label>
      </div>
      {lotForm.expiryMode === 'days' && <p className={styles.formHint}>Validade calculada: {formatExpiryDate(effectiveExpiry)}</p>}
    </fieldset>
    <label>
      Data de validade{(selectedProduct?.controlsExpiry || selectedProduct?.perishable) && Number(lotForm.quantity) > 0 ? ' (obrigatória)' : ''}
      <input type="date" value={effectiveExpiry} onChange={(event) => updateField('expiry', event.target.value)} required={lotForm.expiryMode === 'date' && (selectedProduct?.controlsExpiry || selectedProduct?.perishable) && Number(lotForm.quantity) > 0} disabled={lotForm.expiryMode === 'days'} />
    </label>
    {lotForm.expiryMode === 'days' && <label>
      Prazo de validade (dias)
      <input type="number" min="1" max="36500" step="1" value={lotForm.shelfLifeDays} onChange={(event) => updateField('shelfLifeDays', event.target.value)} required />
      <small>Conta a partir da data de fabricação.</small>
    </label>}
    <label>
      Data de fabricação
      <input type="date" value={lotForm.manufactureDate} onChange={(event) => updateField('manufactureDate', event.target.value)} required={lotForm.expiryMode === 'days'} />
    </label>
    <label className={styles.formWide}>
      Localização
      <input value={lotForm.location} onChange={(event) => updateField('location', event.target.value)} placeholder="Ex.: Câmara fria 2, prateleira A" />
    </label>
    {!editingLot && <p className={`${styles.formHint} ${styles.formWide}`}>Se o mesmo produto, código de lote e datas já estiverem cadastrados, a quantidade será somada ao saldo desse lote.</p>}
    {formError && <div className={`${styles.errorMessage} ${styles.formWide}`} role="alert"><span>{formError}</span></div>}
  </>;
}
