'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import Link from 'next/link';
import {
  auditEventLabel,
  auditRelatedHref,
  auditRelatedRecords,
  auditResourceHref,
  auditResourceLabel,
  sanitizeAuditDetail,
} from '@/features/erp/api/activity-audit';

const pageSize = 50;
const timeFormatter = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZone: 'America/Sao_Paulo',
});

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'object') return JSON.stringify(value, null, 2);
  return String(value);
}

function escapeCsv(value) {
  const text = String(value ?? '');
  const safe = /^[\s]*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

function actorTypeLabel(actorType) {
  return ({
    ERP: 'Equipe ERP',
    CLIENTE: 'Cliente autenticado',
    VISITANTE: 'Visitante',
    ATOR_DO_REGISTRO: 'Ator identificado no registro',
    SISTEMA: 'Sistema/automação',
  })[actorType] || actorType || '—';
}

const auditFieldLabels = {
  title: 'Nome do produto',
  description: 'Descrição',
  price: 'Preço',
  cost: 'Custo',
  discount: 'Desconto',
  quantity: 'Estoque / quantidade',
  image: 'Foto / imagem',
  status: 'Status',
  expiry: 'Validade',
  lotCode: 'Código do lote',
  productId: 'Produto relacionado',
  orderId: 'Pedido relacionado',
  orderItemId: 'Item do pedido',
  supplierId: 'Fornecedor relacionado',
  invoiceId: 'NF-e relacionada',
  purchaseOrderId: 'Ordem de compra relacionada',
  campaignId: 'Cupom relacionado',
  couponCampaignId: 'Cupom relacionado',
  missionId: 'Missão relacionada',
  progressId: 'Progresso da missão',
  customerEmail: 'Cliente relacionado',
  email: 'Cliente/destinatário relacionado',
  countId: 'Balanço relacionado',
  lotId: 'Lote relacionado',
  refundRequestId: 'Solicitação de estorno relacionada',
  sourceOrderId: 'Pedido de origem',
  rewardId: 'Recompensa relacionada',
  rewardRedemptionId: 'Resgate de recompensa relacionado',
  redemptionEntryId: 'Pontos resgatados',
  awardEntryId: 'Pontos concedidos',
  orderItemIndex: 'Item do pedido',
  contributionAmount: 'Valor acumulado na missão',
  contributionCount: 'Quantidade acumulada na missão',
  points: 'Pontos movimentados',
  type: 'Tipo de movimentação',
  receivedQuantity: 'Quantidade recebida',
  receivedUnitCost: 'Custo unitário recebido',
  countedQuantity: 'Quantidade física contada',
  systemQuantity: 'Quantidade registrada no sistema',
  refundedAmount: 'Valor estornado',
  amount: 'Valor da operação',
  reason: 'Motivo',
  note: 'Observação',
  claimedRewards: 'Recompensas concedidas',
  pointsReward: 'Pontos da missão',
  targetAmount: 'Meta de valor',
  targetCount: 'Meta de quantidade',
  completedBy: 'Concluído por',
  reviewedBy: 'Revisado por',
  requestedBy: 'Solicitado por',
  createdBy: 'Criado por',
  updatedBy: 'Atualizado por',
  actor: 'Responsável pela ação',
};

function auditValueLabel(value) {
  if (value?.redacted) return 'Conteúdo protegido; alteração do campo registrada.';
  if (value && typeof value === 'object' && value.__auditAbsent === true) return 'Não informado';
  return formatValue(value);
}

export default function AuditPage() {
  const [entries, setEntries] = useState([]);
  const [query, setQuery] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [appliedFilters, setAppliedFilters] = useState({ query: '', from: '', to: '' });
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const queryString = useMemo(() => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
    if (appliedFilters.query) params.set('q', appliedFilters.query);
    if (appliedFilters.from) params.set('from', appliedFilters.from);
    if (appliedFilters.to) params.set('to', appliedFilters.to);
    return params.toString();
  }, [page, appliedFilters]);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/erp/audit?${queryString}`, { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar os dados auditáveis.');
      setEntries(data.entries || []);
      setTotal(data.total || 0);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar os dados auditáveis.');
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => { loadEntries(); }, [loadEntries]);

  const applyFilters = (event) => {
    event.preventDefault();
    setPage(1);
    setAppliedFilters({ query: query.trim(), from, to });
  };

  const exportCurrentPage = () => {
    const columns = ['Data e hora (America/Sao_Paulo)', 'Responsável', 'Ação', 'Setor / registro', 'ID do registro', 'Registros relacionados', 'Alterações (antes/depois)', 'Observação'];
    const rows = entries.map((entry) => [
      entry.occurredAt ? timeFormatter.format(new Date(entry.occurredAt)) : '',
      entry.actorLabel,
      auditEventLabel(entry),
      auditResourceLabel(entry),
      entry.resourceId,
      auditRelatedRecords(entry).map(({ label, id }) => `${label}: ${id}`).join(' | '),
      JSON.stringify(sanitizeAuditDetail(entry.changes || entry.snapshot)),
      entry.note,
    ]);
    const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `ata-operacional-pagina-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return <section className="audit-page">
    <header className="audit-page-header">
      <div>
        <span className="eyebrow">Governança e rastreabilidade</span>
        <h1>Trilha de operações</h1>
        <p>O que foi criado, alterado ou removido, por quem, quando e em qual registro — com vínculos aos pedidos, produtos, lotes e documentos relacionados.</p>
      </div>
      <button type="button" className="supplier-secondary-button" onClick={loadEntries} disabled={loading}><RefreshCw size={16} aria-hidden="true" /> Atualizar</button>
    </header>

    <aside className="audit-coverage-notice">
      <strong>Escopo da ata operacional</strong>
      <p>Este relatório prioriza operações confirmadas nos registros de produtos e estoque, fornecedores e compras, NF-e, pedidos, estornos e atendimento, cupons e missões. Consultas de tela, leituras de API e tentativas de acesso não aparecem como alterações. Cada linha identifica o registro principal e, quando disponível, os IDs dos registros relacionados. As diferenças mostram os valores anteriores e posteriores; arquivos e conteúdo sensível são omitidos, mas a alteração do campo permanece registrada. Quando o banco não recebeu a identidade de quem executou uma operação, isso é indicado explicitamente como sistema/ator não identificado. Não é possível reconstruir alterações anteriores à ativação da trilha, exceto onde já existia auditoria específica. Os registros não têm expiração automática configurada.</p>
    </aside>

    <form className="audit-filters" onSubmit={applyFilters}>
      <div className="audit-search-field">
        <label htmlFor="audit-search">Buscar responsável, ação, registro ou alteração</label>
        <div><Search size={16} aria-hidden="true" /><input id="audit-search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Ex.: estorno, estoque, cupom, missão..." /></div>
      </div>
      <div><label htmlFor="audit-from">Data inicial</label><input id="audit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
      <div><label htmlFor="audit-to">Data final</label><input id="audit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
      <button type="submit" className="primary-cta"><Search size={15} aria-hidden="true" /> Filtrar</button>
    </form>

    <div className="audit-results-summary" role="status">
      <span>{loading ? 'Carregando histórico...' : `${total.toLocaleString('pt-BR')} operações registradas`}</span>
      <button type="button" className="supplier-secondary-button" onClick={exportCurrentPage} disabled={!entries.length || loading}><Download size={15} aria-hidden="true" /> Exportar ata da página (CSV)</button>
    </div>

    {error && <div className="supplier-form-error" role="alert">{error}</div>}
    {!error && !loading && !entries.length && <div className="audit-empty-state">Nenhum registro encontrado para os filtros selecionados.</div>}
    {entries.length > 0 && <div className="audit-table-wrap">
      <table className="audit-table">
        <thead><tr><th>Data e hora</th><th>Responsável</th><th>Ação / setor</th><th>Registro e vínculos</th><th>Ata da alteração</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={`${entry.source}-${entry.id}`}>
          <td><time dateTime={entry.occurredAt}>{entry.occurredAt ? timeFormatter.format(new Date(entry.occurredAt)) : '—'}</time></td>
          <td><strong>{entry.actorLabel || 'Ator não identificado'}</strong><small>{actorTypeLabel(entry.actorType)}</small></td>
          <td><strong>{auditEventLabel(entry)}</strong><small>{auditResourceLabel(entry)}</small></td>
          <td>
            {auditResourceHref(entry) && <Link className="audit-resource-link" href={auditResourceHref(entry)}>Abrir setor</Link>}
            <small>ID: <code>{entry.resourceId || 'não disponível'}</code></small>
            {auditRelatedRecords(entry).map(({ label, id }) => <small key={`${label}-${id}`}>Vinculado: {label} {auditRelatedHref(label) ? <Link href={auditRelatedHref(label)}><code>{id}</code></Link> : <code>{id}</code>}</small>)}
          </td>
          <td>
            {(entry.changes || entry.snapshot || entry.note) && <details className="audit-entry-details">
              <summary>Abrir ata e diferenças</summary>
              <div className="audit-minute-heading"><strong>{auditEventLabel(entry)} · {auditResourceLabel(entry)}</strong><span>{entry.occurredAt ? timeFormatter.format(new Date(entry.occurredAt)) : 'Data não disponível'} · {entry.actorLabel || 'Ator não identificado'}</span></div>
              {entry.changes && <div><strong>Campos alterados</strong>{Object.entries(sanitizeAuditDetail(entry.changes)).map(([key, value]) => <p key={key}><b>{auditFieldLabels[key] || key}</b><br /><span>Antes: {auditValueLabel(value?.before)}</span><br /><span>Depois: {auditValueLabel(value?.after)}</span></p>)}</div>}
              {entry.snapshot && <div><strong>Dados do registro</strong><pre>{formatValue(sanitizeAuditDetail(entry.snapshot))}</pre></div>}
              {entry.note && <p><strong>Observação:</strong> {entry.note}</p>}
            </details>}
          </td>
        </tr>)}</tbody>
      </table>
    </div>}

    <nav className="audit-pagination" aria-label="Paginação dos dados auditáveis">
      <button type="button" className="supplier-secondary-button" onClick={() => setPage((current) => Math.max(1, current - 1))} disabled={page <= 1 || loading}>Anterior</button>
      <span>Página {page.toLocaleString('pt-BR')} de {totalPages.toLocaleString('pt-BR')}</span>
      <button type="button" className="supplier-secondary-button" onClick={() => setPage((current) => Math.min(totalPages, current + 1))} disabled={page >= totalPages || loading}>Próxima</button>
    </nav>
  </section>;
}
