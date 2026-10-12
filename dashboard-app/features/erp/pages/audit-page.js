'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';

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

function actionLabel(entry) {
  if (entry.source === 'DATABASE') {
    return ({ CREATE: 'Registro criado', UPDATE: 'Registro alterado', DELETE: 'Registro excluído' })[entry.action] || entry.action;
  }
  if (entry.source !== 'ACCESS') return entry.action || 'Alteração registrada';
  return ({
    PAGE_VIEW: 'Visualização de página',
    DATA_READ: 'Consulta de dados',
    COMMAND: 'Ação solicitada',
    UPDATE: 'Alteração solicitada',
    DELETE: 'Exclusão solicitada',
    AUTH: 'Acesso/autenticação',
    REQUEST: 'Requisição',
  })[entry.action] || entry.action;
}

function outcomeLabel(outcome) {
  return ({
    REQUEST_RECEIVED: 'Solicitação recebida',
    RECORDED_CHANGE: 'Alteração registrada',
    LOGIN_REQUIRED: 'Login necessário',
    ACCESS_DENIED: 'Acesso negado',
  })[outcome] || outcome || '—';
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
    const columns = ['Data e hora (America/Sao_Paulo)', 'Usuário', 'Perfil', 'Ação', 'Resultado registrado', 'Origem', 'Método', 'Área/recurso', 'ID do recurso', 'IP', 'Dispositivo', 'Navegador', 'Sistema operacional', 'Parâmetros consultados', 'Alterações/dados disponíveis', 'Observação'];
    const rows = entries.map((entry) => [
      entry.occurredAt ? timeFormatter.format(new Date(entry.occurredAt)) : '',
      entry.actorLabel,
      entry.actorType,
      actionLabel(entry),
      outcomeLabel(entry.outcome),
      entry.source,
      entry.method,
      entry.route || entry.resourceName,
      entry.resourceId,
      entry.ipAddress,
      entry.deviceType,
      entry.browser,
      entry.operatingSystem,
      Array.isArray(entry.queryKeys) ? entry.queryKeys.join(', ') : '',
      JSON.stringify({ changes: entry.changes, snapshot: entry.snapshot }),
      entry.note,
    ]);
    const csv = `\uFEFF${[columns, ...rows].map((row) => row.map(escapeCsv).join(';')).join('\r\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `dados-auditaveis-pagina-${page}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return <section className="audit-page">
    <header className="audit-page-header">
      <div>
        <span className="eyebrow">Governança e rastreabilidade</span>
        <h1>Dados auditáveis</h1>
        <p>Consultas, visualizações e alterações registradas nos setores da plataforma, com data, usuário, dispositivo e histórico disponível.</p>
      </div>
      <button type="button" className="supplier-secondary-button" onClick={loadEntries} disabled={loading}><RefreshCw size={16} aria-hidden="true" /> Atualizar</button>
    </header>

    <aside className="audit-coverage-notice">
      <strong>Escopo e integridade do histórico</strong>
      <p>A trilha de acessos e alterações no banco começa com a ativação deste registro; alterações anteriores só aparecem quando já existia auditoria específica (produtos, fornecedores, NF-e e pedidos de compra). Os dados persistidos passam a registrar diferenças por campo; credenciais, tokens, arquivos e valores extensos são omitidos, mas a mudança do campo continua registrada. Acesso ou solicitação registrada não comprova, por si só, que uma operação sem alteração no banco foi concluída. Os registros não têm expiração automática configurada.</p>
    </aside>

    <form className="audit-filters" onSubmit={applyFilters}>
      <div className="audit-search-field">
        <label htmlFor="audit-search">Buscar em usuário, setor, rota, ação ou alterações registradas</label>
        <div><Search size={16} aria-hidden="true" /><input id="audit-search" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={100} placeholder="Ex.: fornecedor, produto, relatório..." /></div>
      </div>
      <div><label htmlFor="audit-from">Data inicial</label><input id="audit-from" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></div>
      <div><label htmlFor="audit-to">Data final</label><input id="audit-to" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></div>
      <button type="submit" className="primary-cta"><Search size={15} aria-hidden="true" /> Filtrar</button>
    </form>

    <div className="audit-results-summary" role="status">
      <span>{loading ? 'Carregando histórico...' : `${total.toLocaleString('pt-BR')} registros encontrados`}</span>
      <button type="button" className="supplier-secondary-button" onClick={exportCurrentPage} disabled={!entries.length || loading}><Download size={15} aria-hidden="true" /> Exportar página CSV</button>
    </div>

    {error && <div className="supplier-form-error" role="alert">{error}</div>}
    {!error && !loading && !entries.length && <div className="audit-empty-state">Nenhum registro encontrado para os filtros selecionados.</div>}
    {entries.length > 0 && <div className="audit-table-wrap">
      <table className="audit-table">
        <thead><tr><th>Data e hora</th><th>Usuário</th><th>Ação / setor</th><th>Dispositivo e rede</th><th>Registro</th></tr></thead>
        <tbody>{entries.map((entry) => <tr key={`${entry.source}-${entry.id}`}>
          <td><time dateTime={entry.occurredAt}>{entry.occurredAt ? timeFormatter.format(new Date(entry.occurredAt)) : '—'}</time></td>
          <td><strong>{entry.actorLabel || 'Usuário não identificado'}</strong><small>{actorTypeLabel(entry.actorType)}</small></td>
          <td><strong>{actionLabel(entry)}</strong><small>{entry.resourceName || entry.route || '—'}{entry.method ? ` · ${entry.method}` : ''}</small></td>
          <td><strong>{[entry.deviceType, entry.browser, entry.operatingSystem].filter(Boolean).join(' · ') || '—'}</strong><small>IP: {entry.ipAddress || 'não disponível'}</small></td>
          <td>
            <span className={`audit-outcome ${entry.outcome === 'ACCESS_DENIED' ? 'denied' : ''}`}>{outcomeLabel(entry.outcome)}</span>
            {entry.source === 'ACCESS' && Array.isArray(entry.queryKeys) && entry.queryKeys.length > 0 && <small>Filtros: {entry.queryKeys.join(', ')}</small>}
            {(entry.changes || entry.snapshot || entry.note || entry.userAgent) && <details className="audit-entry-details">
              <summary>Ver detalhes</summary>
              {entry.changes && <div><strong>Diferenças registradas</strong>{Object.entries(entry.changes).map(([key, value]) => <p key={key}><b>{key}</b><br />{value?.redacted ? <span>Conteúdo omitido por segurança; alteração do campo registrada.</span> : <><span>Antes: {formatValue(value?.before)}</span><br /><span>Depois: {formatValue(value?.after)}</span></>}</p>)}</div>}
              {entry.snapshot && <div><strong>Registro disponível</strong><pre>{formatValue(entry.snapshot)}</pre></div>}
              {entry.note && <p><strong>Observação:</strong> {entry.note}</p>}
              {entry.userAgent && <p><strong>Agente do dispositivo:</strong><br />{entry.userAgent}</p>}
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
