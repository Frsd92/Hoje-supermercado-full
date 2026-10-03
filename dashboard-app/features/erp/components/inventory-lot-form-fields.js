'use client';

import styles from '../pages/expiry-page.module.css';

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
  productSearch,
  onProductSearchChange,
  matchingProducts = [],
  onProductSelect,
  onClearProductSelection,
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

  const productDescription = (product) => [
    product.sku && `SKU: ${product.sku}`,
    product.barcode && `Código: ${product.barcode}`,
    product.categories?.length && `Categoria: ${product.categories.join(', ')}`,
    product.department && `Departamento: ${product.department}`,
  ].filter(Boolean).join(' · ') || 'Sem código adicional';
  const showSearchResults = Boolean(onProductSearchChange)
    && Boolean(productSearch?.trim())
    && (!selectedProduct || productSearch !== selectedProduct.title);

  return <>
    {onProductSearchChange ? <>
      <label className={styles.formWide}>
        Buscar e selecionar produto
        <input
          type="search"
          value={productSearch}
          onChange={(event) => onProductSearchChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !selectedProduct && matchingProducts[0]) {
              event.preventDefault();
              onProductSelect(matchingProducts[0]);
            }
          }}
          placeholder="Nome, código de barras, SKU, categoria ou departamento"
          autoComplete="off"
          aria-describedby="register-lot-product-search-help"
        />
        <small id="register-lot-product-search-help" role="status" aria-live="polite">
          {selectedProduct
            ? 'Produto selecionado. Preencha os dados da entrada abaixo.'
            : productSearch?.trim()
              ? `${matchingProducts.length} ${matchingProducts.length === 1 ? 'produto encontrado' : 'produtos encontrados'}. Selecione um resultado para continuar.`
              : 'Digite para buscar e selecione um produto nos resultados.'}
        </small>
      </label>
      {showSearchResults && <div className={`${styles.productSearchResults} ${styles.formWide}`} aria-label="Resultados da busca">
        {matchingProducts.length ? matchingProducts.map((product) => <button
          key={product.id}
          className={styles.productSearchResult}
          type="button"
          onClick={() => onProductSelect(product)}
        >
          <span className={styles.productSearchResultName}>{product.title}</span>
          <span className={styles.productSearchResultMeta}>{productDescription(product)}</span>
        </button>) : <p className={styles.productSearchEmpty} role="status">Nenhum produto encontrado. Tente outro nome, código, SKU ou classificação.</p>}
      </div>}
      {selectedProduct && <div className={`${styles.selectedProductSummary} ${styles.formWide}`}>
        <div className={styles.selectedProductDetails}>
          <span className={styles.selectedProductLabel}>Produto selecionado</span>
          <strong>{selectedProduct.title}</strong>
          <small>{productDescription(selectedProduct)}</small>
          <small>Saldo agregado atual: {Number(selectedProduct.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {selectedProduct.saleUnit}</small>
        </div>
        <button className={styles.changeProductButton} type="button" onClick={onClearProductSelection}>Trocar produto</button>
      </div>}
    </> : <label className={styles.formWide}>
      Produto
      <select value={lotForm.productId} onChange={selectProduct} required disabled={Boolean(editingLot)}>
        <option value="">Selecione um produto</option>
        {products.map((product) => <option key={product.id} value={product.id}>{product.title} · {product.sku || product.externalId}</option>)}
      </select>
      {selectedProduct && <small>Saldo agregado atual: {Number(selectedProduct.quantity || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {selectedProduct.saleUnit}</small>}
    </label>}
    {(!onProductSearchChange || selectedProduct) && <>
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
    </>}
  </>;
}
