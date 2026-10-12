'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, ArrowDownToLine, Check, ChevronRight, ClipboardCheck, FileText, History, LoaderCircle, Plus, RefreshCw, Save, Search, Upload, X } from 'lucide-react';

const currency = (value) => `R$ ${Number(value || 0).toFixed(2).replace('.', ',')}`;
const dateTime = (value) => value
  ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value))
  : '—';
const dateOnly = (value) => value ? String(value).slice(0, 10) : '';
const statusOptions = ['Todas', 'Aguardando conferência', 'Aguardando validação fiscal', 'Pronta para lançamento', 'Lançada'];

async function readResponse(response, fallback) {
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error(fallback);
  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error(fallback);
  }
  if (!response.ok) throw new Error(data.error || fallback);
  return data;
}

function csvCell(value) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function exportInvoiceCsv(invoices) {
  const rows = [
    ['Tipo de registro', 'Chave de acesso', 'Número', 'Série', 'Emitente', 'CPF/CNPJ', 'Emissão', 'Total NF-e', 'Situação NF-e', 'Fornecedor', 'Produto/Parcela', 'EAN/SKU', 'Quantidade faturada', 'Aceito', 'Faltante', 'Avariado', 'Devolvido', 'Custo unitário aprovado', 'Vencimento', 'Valor original da parcela', 'Situação financeira', 'Referência/observação'],
  ];
  for (const invoice of invoices) {
    const common = [invoice.accessKey, invoice.invoiceNumber, invoice.series, invoice.issuerName, invoice.issuerTaxId, dateOnly(invoice.issuedAt), Number(invoice.total).toFixed(2), invoice.status, invoice.supplier?.name || ''];
    rows.push(['NF-e', ...common, '', '', '', '', '', '', '', '', '', '', '', '']);
    for (const item of invoice.items) {
      rows.push(['ITEM', ...common, item.description, item.ean, item.invoiceQuantity, item.acceptedQuantity, item.missingQuantity, item.damagedQuantity, item.returnedQuantity, item.approvedUnitCost ?? '', '', '', '', item.discrepancyNote || '']);
    }
    for (const payable of invoice.payables) {
      rows.push(['PARCELA', ...common, payable.installment, '', '', '', '', '', '', '', payable.dueAt || '', Number(payable.amount).toFixed(2), payable.status, [payable.paymentMethod, payable.paymentReference, payable.notes].filter(Boolean).join(' · ')]);
    }
  }
  const content = `\uFEFF${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}`;
  const url = URL.createObjectURL(new Blob([content], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = 'exportacao-operacional-nfe-contas-a-pagar.csv';
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

function makeInvoiceDraft(invoice) {
  return {
    supplierId: invoice.supplierId || '',
    purchaseOrderId: invoice.purchaseOrderId || '',
    items: invoice.items.map((item) => ({
      id: item.id,
      productId: item.productId || '',
      acceptedQuantity: String(item.acceptedQuantity ?? 0),
      missingQuantity: String(item.missingQuantity ?? 0),
      damagedQuantity: String(item.damagedQuantity ?? 0),
      returnedQuantity: String(item.returnedQuantity ?? 0),
      approvedUnitCost: item.approvedUnitCost === null ? '' : String(item.approvedUnitCost).replace('.', ','),
      discrepancyNote: item.discrepancyNote || '',
      receiptLots: (item.receiptLots || []).map((lot) => ({
        quantity: String(lot.quantity),
        lotCode: lot.lotCode || '',
        expiry: lot.expiry || '',
        manufactureDate: lot.manufactureDate || '',
        location: lot.location || '',
      })),
    })),
    payables: invoice.payables.map((payable) => ({
      id: payable.id,
      dueAt: dateOnly(payable.dueAt),
      status: payable.status,
      paidAt: dateOnly(payable.paidAt),
      paymentMethod: payable.paymentMethod || '',
      paymentReference: payable.paymentReference || '',
      notes: payable.notes || '',
    })),
  };
}

function InvoiceDetails({ invoice, suppliers, orders, products, onClose, onSaved, onPosted }) {
  const [draft, setDraft] = useState(() => makeInvoiceDraft(invoice));
  const [saving, setSaving] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDraft(makeInvoiceDraft(invoice));
    setError('');
    setNotice('');
  }, [invoice]);

  const updateLine = (index, changes) => setDraft((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === index ? { ...item, ...changes } : item),
  }));
  const updateLot = (lineIndex, lotIndex, changes) => setDraft((current) => ({
    ...current,
    items: current.items.map((item, itemIndex) => itemIndex === lineIndex
      ? { ...item, receiptLots: item.receiptLots.map((lot, currentLotIndex) => currentLotIndex === lotIndex ? { ...lot, ...changes } : lot) }
      : item),
  }));
  const updatePayable = (index, changes) => setDraft((current) => ({
    ...current,
    payables: current.payables.map((payable, payableIndex) => payableIndex === index ? { ...payable, ...changes } : payable),
  }));

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/erp/invoices/${encodeURIComponent(invoice.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      const data = await readResponse(response, 'Não foi possível salvar a conferência.');
      setNotice('Conferência e contas a pagar salvas no histórico auditável.');
      onSaved(data.invoice);
    } catch (saveError) {
      setError(saveError.message || 'Não foi possível salvar a conferência.');
    } finally {
      setSaving(false);
    }
  };

  const post = async () => {
    if (!window.confirm('Confirma que a NF-e e o protocolo foram revisados pelo responsável fiscal e que custos, quantidades e divergências estão conferidos? Esta ação lança estoque e custo, atualiza a ordem de compra vinculada e não pode ser desfeita por esta tela.')) return;
    setPosting(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/erp/invoices/${encodeURIComponent(invoice.id)}/post`, { method: 'POST' });
      const data = await readResponse(response, 'Não foi possível lançar esta NF-e.');
      setNotice('Lançamento confirmado. Estoque, custos e contas a pagar foram atualizados.');
      onPosted(data.invoice);
    } catch (postError) {
      setError(postError.message || 'Não foi possível lançar esta NF-e.');
    } finally {
      setPosting(false);
    }
  };

  const selectedSupplier = suppliers.find((supplier) => supplier.id === draft.supplierId);
  const availableOrders = orders.filter((order) => order.supplierId === draft.supplierId
    && ['Confirmado', 'Em Trânsito'].includes(order.status));
  const payableTotal = invoice.payables.reduce((sum, payable) => sum + Number(payable.amount), 0);
  const payableVariance = payableTotal - Number(invoice.total);

  return <aside className="invoice-detail-panel" aria-label={`Detalhes da NF-e ${invoice.invoiceNumber}`}>
    <div className="invoice-detail-header">
      <div><span className="eyebrow">Conferência de entrada</span><h2>NF-e {invoice.invoiceNumber} · série {invoice.series}</h2><p>{invoice.issuerName} · emitida em {dateOnly(invoice.issuedAt)}</p></div>
      <button type="button" className="supplier-edit-button" onClick={onClose} aria-label="Fechar detalhes da nota"><X size={16} /></button>
    </div>
    {error && <div className="supplier-error" role="alert">{error}</div>}
    {notice && <div className="supplier-notice" role="status"><Check size={16} />{notice}</div>}
    <div className="invoice-fiscal-warning"><AlertTriangle size={17} /><span><strong>Conferência fiscal necessária.</strong> O XML e o código de protocolo não comprovam por si só a assinatura nem a situação atual na SEFAZ. Confirme a NF-e com o responsável fiscal; o lançamento permanece bloqueado sem protocolo de autorização informado.</span></div>
    <div className="invoice-detail-facts">
      <div><span>Emitente</span><strong>{invoice.issuerName}</strong></div>
      <div><span>CPF/CNPJ</span><strong>{invoice.issuerTaxId}</strong></div>
      <div><span>Chave de acesso</span><strong className="invoice-access-key">{invoice.accessKey}</strong></div>
      <div><span>Protocolo informado</span><strong>{invoice.protocolNumber || 'Não informado'} · cStat {invoice.protocolStatus || '—'} · {invoice.authorizationDataComplete ? 'estrutura completa' : 'estrutura incompleta'}</strong></div>
      <div><span>Total fiscal integral</span><strong>{currency(invoice.total)}</strong></div>
      <div><span>Total das parcelas importadas</span><strong>{currency(payableTotal)}{Math.abs(payableVariance) > 0.01 ? ` · diferença ${currency(payableVariance)}` : ''}</strong></div>
      <div><span>Importada por / em</span><strong>{invoice.importedBy || '—'} · {dateTime(invoice.importedAt)}</strong></div>
    </div>
    <div className="invoice-file-actions">
      <a className="supplier-secondary-button" href={`/api/erp/invoices/${encodeURIComponent(invoice.id)}/file?type=xml`}><ArrowDownToLine size={15} /> XML original</a>
      {invoice.danfeFileName
        ? <a className="supplier-secondary-button" href={`/api/erp/invoices/${encodeURIComponent(invoice.id)}/file?type=danfe`}><ArrowDownToLine size={15} /> DANFE PDF</a>
        : <span className="invoice-no-file">PDF do DANFE não anexado</span>}
    </div>

    <form className="invoice-review-form" onSubmit={save}>
      <section className="invoice-review-section">
        <h3>Vínculo com fornecedor e ordem de compra</h3>
        <div className="invoice-field-grid">
          <label>Fornecedor cadastrado
            <select value={draft.supplierId} onChange={(event) => setDraft((current) => ({ ...current, supplierId: event.target.value, purchaseOrderId: '' }))} disabled={invoice.status === 'Lançada'}>
              <option value="">Selecione pelo CPF/CNPJ do emitente</option>
              {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name} · {supplier.taxId || supplier.identityTaxId || 'sem documento'}</option>)}
            </select>
            {selectedSupplier && <small>Vínculo validado pelo CPF/CNPJ cadastrado.</small>}
          </label>
          <label>Ordem de compra (opcional)
            <select value={draft.purchaseOrderId} onChange={(event) => setDraft((current) => ({ ...current, purchaseOrderId: event.target.value }))} disabled={!draft.supplierId || invoice.status === 'Lançada'}>
              <option value="">Sem ordem de compra</option>
              {availableOrders.map((order) => <option key={order.id} value={order.id}>{order.code} · {order.status}</option>)}
            </select>
            {draft.purchaseOrderId && <small>Ao lançar, as quantidades recebidas também serão refletidas na ordem.</small>}
          </label>
        </div>
      </section>

      <section className="invoice-review-section">
        <h3>Itens da NF-e e conferência física</h3>
        <p className="invoice-section-hint">As quantidades recebido + faltante + avariado + devolvido devem fechar exatamente com a quantidade faturada. O custo é uma decisão interna aprovada pelo responsável; frete, tributos recuperáveis e outros créditos devem ser avaliados à parte.</p>
        <div className="invoice-items">
          {invoice.items.map((line, index) => {
            const draftLine = draft.items[index];
            const product = products.find((entry) => entry.id === draftLine.productId);
            const discrepancy = Number(draftLine.missingQuantity || 0) + Number(draftLine.damagedQuantity || 0) + Number(draftLine.returnedQuantity || 0) > 0;
            return <article className="invoice-item-card" key={line.id}>
              <div className="invoice-item-heading"><div><strong>{line.lineNumber}. {line.description}</strong><span>EAN {line.ean || 'não informado'} · código fornecedor {line.supplierProductCode || '—'}</span></div><strong>{currency(line.lineTotal)}</strong></div>
              <div className="invoice-item-fiscal"><span>Faturado: <strong>{line.invoiceQuantity} {line.unit}</strong></span><span>Unitário NF-e: <strong>{currency(line.unitPrice)}</strong></span><span>CFOP / NCM: <strong>{line.cfop || '—'} / {line.ncm || '—'}</strong></span></div>
              {line.invoiceLots?.length > 0 && <div className="invoice-xml-lots"><strong>Rastreabilidade informada pelo fornecedor no XML</strong><span>{line.invoiceLots.map((lot) => `${lot.lotCode || 'lote sem código'} · ${lot.quantity} ${line.unit}${lot.expiry ? ` · validade ${lot.expiry}` : ''}`).join(' | ')}</span><button type="button" className="supplier-secondary-button" onClick={() => updateLine(index, { receiptLots: line.invoiceLots.map((lot) => ({ quantity: '', lotCode: lot.lotCode || '', expiry: lot.expiry || '', manufactureDate: lot.manufactureDate || '', location: '' })) })} disabled={invoice.status === 'Lançada'}>Usar dados do XML como sugestão de lote</button></div>}
              <div className="invoice-field-grid">
                <label>Produto interno
                  <select value={draftLine.productId} onChange={(event) => updateLine(index, { productId: event.target.value })} disabled={invoice.status === 'Lançada'}>
                    <option value="">Selecione produto do catálogo</option>
                    {products.map((entry) => <option key={entry.id} value={entry.id}>{entry.title}{entry.sku ? ` · ${entry.sku}` : ''}</option>)}
                  </select>
                  {product && <small>Saldo: {product.quantity} · custo atual: {currency(product.cost)}{product.controlsExpiry ? ' · controla validade' : ''}{product.controlsLot ? ' · controla lote' : ''}</small>}
                </label>
                <label>Custo unitário aprovado (R$)
                  <input inputMode="decimal" placeholder="0,00" value={draftLine.approvedUnitCost} onChange={(event) => updateLine(index, { approvedUnitCost: event.target.value })} disabled={invoice.status === 'Lançada'} />
                </label>
              </div>
              <div className="invoice-quantity-grid">
                {[
                  ['acceptedQuantity', 'Aceito para estoque'],
                  ['missingQuantity', 'Faltante'],
                  ['damagedQuantity', 'Avariado'],
                  ['returnedQuantity', 'Devolvido'],
                ].map(([field, label]) => <label key={field}>{label}
                  <input type="number" min="0" max="999999999.999" step="0.001" value={draftLine[field]} onChange={(event) => updateLine(index, { [field]: event.target.value })} disabled={invoice.status === 'Lançada'} />
                </label>)}
              </div>
              {discrepancy && <label className="invoice-full-field">Registro de divergência
                <textarea rows="2" maxLength="1000" value={draftLine.discrepancyNote} onChange={(event) => updateLine(index, { discrepancyNote: event.target.value })} placeholder="Descreva falta, avaria ou devolução e evidências." disabled={invoice.status === 'Lançada'} />
              </label>}
              {Number(draftLine.acceptedQuantity || 0) > 0 && <div className="invoice-lots">
                <div className="invoice-lots-heading"><strong>Lotes recebidos</strong><button type="button" className="supplier-secondary-button" onClick={() => updateLine(index, { receiptLots: [...draftLine.receiptLots, { quantity: '', lotCode: '', expiry: '', manufactureDate: '', location: '' }] })} disabled={invoice.status === 'Lançada'}><Plus size={14} /> Adicionar lote</button></div>
                {!draftLine.receiptLots.length && <small>Sem detalhe de lote cadastrado. Produtos que controlam lote ou validade exigem o preenchimento antes do lançamento.</small>}
                {draftLine.receiptLots.map((lot, lotIndex) => <div className="invoice-lot-row" key={`${line.id}-lot-${lotIndex}`}>
                  <label>Quantidade<input type="number" min="0" max="999999999.999" step="0.001" value={lot.quantity} onChange={(event) => updateLot(index, lotIndex, { quantity: event.target.value })} disabled={invoice.status === 'Lançada'} /></label>
                  <label>Código do lote<input maxLength="80" value={lot.lotCode} onChange={(event) => updateLot(index, lotIndex, { lotCode: event.target.value })} disabled={invoice.status === 'Lançada'} /></label>
                  <label>Validade<input type="date" value={lot.expiry} onChange={(event) => updateLot(index, lotIndex, { expiry: event.target.value })} disabled={invoice.status === 'Lançada'} /></label>
                  <label>Fabricação<input type="date" value={lot.manufactureDate} onChange={(event) => updateLot(index, lotIndex, { manufactureDate: event.target.value })} disabled={invoice.status === 'Lançada'} /></label>
                  <button type="button" className="supplier-edit-button" aria-label="Remover lote" onClick={() => updateLine(index, { receiptLots: draftLine.receiptLots.filter((_, currentIndex) => currentIndex !== lotIndex) })} disabled={invoice.status === 'Lançada'}><X size={14} /></button>
                </div>)}
              </div>}
            </article>;
          })}
        </div>
      </section>

      <section className="invoice-review-section">
        <h3>Contas a pagar · valores integrais da NF-e</h3>
        <p className="invoice-section-hint">As divergências não reduzem automaticamente o valor devido. Registre pagamento, vencimento ou disputa sem alterar o valor original da parcela.</p>
        {Math.abs(payableVariance) > 0.01 && <div className="invoice-fiscal-warning"><AlertTriangle size={17} /><span>As parcelas importadas somam {currency(payableTotal)}, diferente do total da NF-e ({currency(invoice.total)}). Confira duplicatas, pagamentos e condições comerciais com o documento antes da baixa; os valores originais não foram ajustados automaticamente.</span></div>}
        {draft.payables.map((payable, index) => <div className="invoice-payable-card" key={payable.id}>
          <div><strong>Parcela {payable.installment}</strong><span>Valor original preservado: {currency(invoice.payables[index].amount)}</span></div>
          <div className="invoice-payable-fields">
            <label>Vencimento<input type="date" value={payable.dueAt} onChange={(event) => updatePayable(index, { dueAt: event.target.value })} disabled={invoice.status === 'Lançada'} /></label>
            <label>Situação<select value={payable.status === 'Aguardando lançamento' ? 'Em Análise' : payable.status} onChange={(event) => updatePayable(index, { status: event.target.value })} disabled={invoice.status === 'Lançada'}><option>Em Análise</option><option>Em aberto</option><option>Em disputa</option><option>Paga</option></select></label>
            {payable.status === 'Paga' && <><label>Pago em<input type="date" value={payable.paidAt} onChange={(event) => updatePayable(index, { paidAt: event.target.value })} disabled={invoice.status === 'Lançada'} /></label><label>Forma de pagamento<input maxLength="80" value={payable.paymentMethod} onChange={(event) => updatePayable(index, { paymentMethod: event.target.value })} placeholder="Ex.: transferência" disabled={invoice.status === 'Lançada'} /></label></>}
            <label>Referência<input maxLength="120" value={payable.paymentReference} onChange={(event) => updatePayable(index, { paymentReference: event.target.value })} placeholder="Identificação do pagamento ou disputa" disabled={invoice.status === 'Lançada'} /></label>
            <label>Observações<input maxLength="1000" value={payable.notes} onChange={(event) => updatePayable(index, { notes: event.target.value })} disabled={invoice.status === 'Lançada'} /></label>
          </div>
        </div>)}
      </section>

      {invoice.auditLogs?.length > 0 && <section className="invoice-review-section">
        <h3><History size={17} /> Histórico auditável da transação</h3>
        <ol className="invoice-audit-list">{invoice.auditLogs.map((entry) => <li key={entry.id}><strong>{entry.action.replaceAll('_', ' ')}</strong><span>{entry.actor} · {dateTime(entry.occurredAt)}</span>{entry.note && <p>{entry.note}</p>}{(entry.snapshot || entry.changes) && <details><summary>Ver snapshot completo desta etapa</summary><pre>{JSON.stringify({ snapshot: entry.snapshot, changes: entry.changes }, null, 2)}</pre></details>}</li>)}</ol>
      </section>}
      {invoice.status !== 'Lançada' && <div className="invoice-detail-actions">
        <button type="submit" className="supplier-secondary-button" disabled={saving || posting}><Save size={15} />{saving ? 'Salvando…' : 'Salvar conferência'}</button>
        <button type="button" className="primary-cta" onClick={post} disabled={saving || posting || invoice.status !== 'Pronta para lançamento'}>
          {posting ? <LoaderCircle size={15} className="invoice-spin" /> : <ClipboardCheck size={15} />}
          {posting ? 'Lançando…' : invoice.status === 'Pronta para lançamento' ? 'Confirmar lançamento' : 'Conclua a conferência para lançar'}
        </button>
      </div>}
      {invoice.status === 'Lançada' && <div className="invoice-posted-notice"><Check size={16} /><span>Lançada por {invoice.postedBy || 'responsável'} em {dateTime(invoice.postedAt)}. Para ajustes, registre movimentação de estoque/devolução separada e mantenha esta NF-e imutável.</span></div>}
    </form>
  </aside>;
}

export default function SupplierInvoicesPage() {
  const [invoices, setInvoices] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('Todas');
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMessage, setUploadMessage] = useState('');
  const xmlRef = useRef(null);
  const danfeRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [invoiceResponse, supplierResponse, orderResponse] = await Promise.all([
        fetch('/api/erp/invoices', { cache: 'no-store' }),
        fetch('/api/erp/suppliers', { cache: 'no-store' }),
        fetch('/api/erp/purchase-orders', { cache: 'no-store' }),
      ]);
      const [invoiceData, supplierData, orderData] = await Promise.all([
        readResponse(invoiceResponse, 'Não foi possível carregar as NF-e.'),
        readResponse(supplierResponse, 'Não foi possível carregar fornecedores.'),
        readResponse(orderResponse, 'Não foi possível carregar produtos e ordens.'),
      ]);
      setInvoices(invoiceData.invoices || []);
      setMetrics(invoiceData.metrics || {});
      setHasMore(invoiceData.hasMore === true);
      setSuppliers(supplierData.suppliers || []);
      setOrders(orderData.orders || []);
      setProducts(orderData.products || []);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar o módulo de NF-e.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const loadMore = async () => {
    setLoadingMore(true);
    setError('');
    try {
      const response = await fetch(`/api/erp/invoices?skip=${invoices.length}`, { cache: 'no-store' });
      const data = await readResponse(response, 'Não foi possível carregar mais notas fiscais.');
      setInvoices((current) => [...current, ...(data.invoices || [])]);
      setMetrics(data.metrics || {});
      setHasMore(data.hasMore === true);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar mais notas fiscais.');
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredInvoices = useMemo(() => invoices.filter((invoice) => {
    const matchesStatus = filter === 'Todas' || invoice.status === filter;
    const needle = query.trim().toLocaleLowerCase('pt-BR');
    const matchesQuery = !needle || [invoice.invoiceNumber, invoice.accessKey, invoice.issuerName, invoice.issuerTaxId, invoice.supplier?.name]
      .some((value) => String(value || '').toLocaleLowerCase('pt-BR').includes(needle));
    return matchesStatus && matchesQuery;
  }), [filter, invoices, query]);

  const openInvoice = async (invoice) => {
    setError('');
    try {
      const response = await fetch(`/api/erp/invoices/${encodeURIComponent(invoice.id)}`, { cache: 'no-store' });
      const data = await readResponse(response, 'Não foi possível abrir os detalhes da NF-e.');
      setSelectedInvoice(data.invoice);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível abrir os detalhes da NF-e.');
    }
  };

  const mergeInvoice = (updated) => {
    setSelectedInvoice(updated);
    setInvoices((current) => current.map((invoice) => invoice.id === updated.id ? updated : invoice));
    load().catch(() => {});
  };

  const importInvoice = async (event) => {
    event.preventDefault();
    const xml = xmlRef.current?.files?.[0];
    const danfe = danfeRef.current?.files?.[0];
    if (!xml) {
      setUploadMessage('Selecione o XML original da NF-e.');
      return;
    }
    setUploading(true);
    setUploadMessage('');
    setError('');
    const formData = new FormData();
    formData.append('xml', xml);
    if (danfe) formData.append('danfe', danfe);
    try {
      const response = await fetch('/api/erp/invoices', { method: 'POST', body: formData });
      const data = await readResponse(response, 'Não foi possível importar os arquivos da NF-e.');
      if (xmlRef.current) xmlRef.current.value = '';
      if (danfeRef.current) danfeRef.current.value = '';
      setUploadMessage(`NF-e ${data.invoice.invoiceNumber} importada e registrada no histórico.`);
      await load();
      setSelectedInvoice(data.invoice);
    } catch (importError) {
      setError(importError.message || 'Não foi possível importar a NF-e.');
    } finally {
      setUploading(false);
    }
  };

  return <div className="erp-module-page supplier-page invoice-page">
    <header className="erp-customer-header supplier-page-header">
      <div><span className="eyebrow">Suprimentos · Fiscal · Financeiro</span><h1>NF-e de fornecedores</h1><p>Importe XML/DANFE, confira o recebimento, registre divergências e aprove a entrada de estoque.</p></div>
      <div className="supplier-header-actions"><button type="button" className="supplier-secondary-button" onClick={() => exportInvoiceCsv(invoices)} disabled={!invoices.length}><ArrowDownToLine size={15} /> Exportar registros carregados</button><button type="button" className="supplier-secondary-button" onClick={load} disabled={loading}><RefreshCw size={15} /> Atualizar</button></div>
    </header>
    <nav className="supplier-subnav" aria-label="Módulos de abastecimento"><Link href="/erp/suppliers">Fornecedores</Link><Link href="/erp/suppliers/orders">Ordens de compra</Link><span className="active" aria-current="page">NF-e / DANFE</span></nav>
    {error && <div className="supplier-error" role="alert">{error}<button type="button" onClick={() => setError('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
    {uploadMessage && <div className="supplier-notice" role="status"><Check size={16} />{uploadMessage}<button type="button" onClick={() => setUploadMessage('')} aria-label="Fechar aviso"><X size={14} /></button></div>}
    <div className="supplier-data-notice"><strong>Controle operacional; não substitui a escrituração fiscal</strong><span>Este módulo registra documentos, conferência e contas a pagar para revisão interna. Não consulta a SEFAZ nem verifica criptograficamente a assinatura do XML. Confirme autorização, destinatário, tributação e procedimentos de escrituração/devolução com o responsável fiscal ou contador.</span></div>

    <section className="supplier-metrics invoice-metrics" aria-label="Resumo de notas fiscais">
      <article><span>Notas importadas</span><strong>{metrics.total ?? 0}</strong><small>{metrics.loaded ?? 0} exibidas (limite de 500)</small></article>
      <article className="review"><span>Aguardando conferência</span><strong>{metrics.awaitingReview ?? 0}</strong><small>inclui validação fiscal pendente</small></article>
      <article className="active"><span>Lançadas</span><strong>{metrics.posted ?? 0}</strong><small>com histórico operacional</small></article>
      <article><span>Contas em aberto ou análise</span><strong>{currency(metrics.payableAmount)}</strong><small>{metrics.overduePayables ?? 0} parcelas vencidas</small></article>
    </section>

    <form className="invoice-upload-card" onSubmit={importInvoice}>
      <div className="invoice-upload-copy"><span className="invoice-upload-icon"><Upload size={19} /></span><div><h2>Importar documento fiscal</h2><p>XML obrigatório (até 2 MB) e DANFE PDF opcional (até 2 MB). A chave de acesso impede duplicar a mesma NF-e.</p></div></div>
      <div className="invoice-upload-inputs">
        <label>XML da NF-e (.xml)<input ref={xmlRef} type="file" accept=".xml,text/xml,application/xml" required disabled={uploading} /></label>
        <label>DANFE do fornecedor (.pdf)<input ref={danfeRef} type="file" accept=".pdf,application/pdf" disabled={uploading} /></label>
        <button type="submit" className="primary-cta" disabled={uploading}>{uploading ? <LoaderCircle size={15} className="invoice-spin" /> : <Upload size={15} />}{uploading ? 'Importando…' : 'Importar NF-e'}</button>
      </div>
    </form>

    <section className="supplier-table-panel invoice-table-panel" aria-label="Histórico de NF-e">
      <div className="supplier-tools"><label className="supplier-search"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar por nota, chave, fornecedor ou CPF/CNPJ" /></label><label className="supplier-category-filter">Situação<select value={filter} onChange={(event) => setFilter(event.target.value)}>{statusOptions.map((status) => <option key={status}>{status}</option>)}</select></label></div>
      {loading ? <div className="supplier-empty-state"><LoaderCircle className="invoice-spin" size={24} /><strong>Carregando notas fiscais…</strong></div>
        : !filteredInvoices.length ? <div className="supplier-empty-state"><FileText size={27} /><strong>{invoices.length ? 'Nenhuma NF-e corresponde à busca' : 'Nenhuma NF-e recebida'}</strong><span>Importe o XML encaminhado pelo fornecedor para iniciar a conferência.</span></div>
          : <><div className="supplier-table-scroll"><table className="supplier-table invoice-table"><thead><tr><th>Nota / fornecedor</th><th>CPF/CNPJ</th><th>Emissão</th><th>Itens</th><th>Total fiscal</th><th>Contas a pagar</th><th>Situação</th><th>Ação</th></tr></thead><tbody>{filteredInvoices.map((invoice) => <tr key={invoice.id}>
            <td><strong>NF-e {invoice.invoiceNumber} · série {invoice.series}</strong><small>{invoice.issuerName}</small><small className="invoice-table-key">{invoice.accessKey}</small></td>
            <td>{invoice.issuerTaxId}</td><td>{dateOnly(invoice.issuedAt)}</td><td>{invoice.items.length}</td><td><strong>{currency(invoice.total)}</strong></td>
            <td>{invoice.payables.length} parcela(s)<small>{invoice.payables.some((payable) => payable.status === 'Em disputa') ? 'Há valor em disputa; sem abatimento automático.' : 'Valor integral preservado'}</small></td>
            <td><span className={`supplier-status-badge ${invoice.status === 'Lançada' ? 'active' : invoice.status === 'Pronta para lançamento' ? 'review' : 'inactive'}`}>{invoice.status}</span></td>
            <td><button type="button" className="supplier-edit-button" onClick={() => openInvoice(invoice)}>Conferir <ChevronRight size={14} /></button></td>
          </tr>)}</tbody></table><div className="supplier-table-footer">Exibindo {filteredInvoices.length} correspondências nas {invoices.length} notas carregadas · total no sistema: {metrics.total ?? invoices.length}. Use “Carregar mais” para consultar registros anteriores.</div></div>{hasMore && <div className="invoice-load-more"><button type="button" className="supplier-secondary-button" onClick={loadMore} disabled={loadingMore}>{loadingMore ? <LoaderCircle size={15} className="invoice-spin" /> : <Plus size={15} />}{loadingMore ? 'Carregando…' : 'Carregar mais notas'}</button></div>}</>}
    </section>
    {selectedInvoice && <InvoiceDetails invoice={selectedInvoice} suppliers={suppliers} orders={orders} products={products} onClose={() => setSelectedInvoice(null)} onSaved={mergeInvoice} onPosted={mergeInvoice} />}
  </div>;
}
