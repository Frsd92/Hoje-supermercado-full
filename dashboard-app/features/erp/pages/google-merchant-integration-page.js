'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, RefreshCw, UploadCloud } from 'lucide-react';

export default function GoogleMerchantIntegrationPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [summary, setSummary] = useState(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/erp/merchant/status', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível verificar a conexão com o Google Merchant Center.');
      setStatus(data);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível verificar a conexão com o Google Merchant Center.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const synchronize = async () => {
    setWorking(true);
    setError('');
    setNotice('');
    setSummary(null);
    try {
      const response = await fetch('/api/erp/merchant/sync', { method: 'POST' });
      const data = await response.json();
      setSummary(data);
      if (!response.ok) {
        const firstError = data.errors?.[0]?.reason || data.error;
        throw new Error(firstError || 'A sincronização terminou com erros. Consulte o resumo abaixo.');
      }
      setNotice('Sincronização concluída. As atualizações podem levar alguns minutos para aparecer no Merchant Center.');
    } catch (syncError) {
      setError(syncError.message || 'Não foi possível sincronizar os produtos.');
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="erp-bling-page">
      <header className="erp-customer-header">
        <div>
          <span className="eyebrow">Integrações</span>
          <h1>Google Merchant Center</h1>
          <p>Envie o catálogo ativo da loja para a fonte de produtos da Merchant API.</p>
        </div>
      </header>

      {error && <p className="erp-bling-message error" role="alert"><AlertCircle size={17} />{error}</p>}
      {notice && <p className="erp-bling-message success" role="status"><CheckCircle2 size={17} />{notice}</p>}

      <section className="erp-bling-card" aria-labelledby="merchant-connection-title">
        <div className="erp-bling-card-heading">
          <div><span className="eyebrow">Catálogo</span><h2 id="merchant-connection-title">{loading ? 'Verificando configuração...' : status?.configured ? 'Pronto para sincronizar' : 'Configuração pendente'}</h2></div>
          <span className={`erp-bling-state${status?.configured ? ' connected' : ''}`}>{loading ? 'Verificando' : status?.configured ? 'Configurado' : 'Pendente'}</span>
        </div>
        <p>Produtos ativos são enviados com preço atual, promoção, disponibilidade, imagem e uma página pública com os detalhes do produto. Produtos que deixaram de estar ativos ou foram removidos do catálogo são retirados desta fonte.</p>

        {status && <dl className="erp-bling-details">
          <div><dt>Conta Merchant Center</dt><dd>{status.accountId || 'Não configurada'}</dd></div>
          <div><dt>Fonte de dados</dt><dd>{status.dataSource || 'Não configurada'}</dd></div>
        </dl>}

        {!loading && status?.missing?.length > 0 && <div className="erp-bling-setup">
          <h3>Variáveis de ambiente pendentes</h3>
          <ul>{status.missing.map((name) => <li key={name}><AlertCircle size={16} aria-hidden="true" /><span>{name}</span><strong>Pendente</strong></li>)}</ul>
          <p>Adicione essas variáveis no ambiente de produção da Vercel. A chave JSON da conta de serviço deve ficar somente como variável secreta do servidor; não a envie pelo chat nem a coloque no repositório.</p>
        </div>}
        {!loading && status?.configured && !status.automaticSyncConfigured && <p className="erp-bling-hint">A sincronização manual está pronta. Para habilitar a atualização automática diária, configure também a variável secreta <code>CRON_SECRET</code> na Vercel.</p>}

        <div className="erp-bling-actions">
          <button type="button" className="primary-cta" disabled={loading || working || !status?.configured} onClick={() => void synchronize()}>
            {working ? <RefreshCw size={17} className="erp-merchant-spinning" aria-hidden="true" /> : <UploadCloud size={17} aria-hidden="true" />}
            {working ? 'Sincronizando...' : 'Sincronizar produtos agora'}
          </button>
          <button type="button" className="secondary-cta" disabled={loading || working} onClick={() => void loadStatus()}>Atualizar configuração</button>
          <a className="secondary-cta" href="https://merchants.google.com/" target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />Abrir Merchant Center
          </a>
        </div>
      </section>

      {summary && <section className="erp-bling-card" aria-labelledby="merchant-summary-title">
        <div className="erp-bling-card-heading"><div><span className="eyebrow">Resultado</span><h2 id="merchant-summary-title">Resumo da sincronização</h2></div></div>
        <dl className="erp-bling-details">
          <div><dt>Produtos ativos no catálogo</dt><dd>{summary.active ?? '—'}</dd></div>
          <div><dt>Enviados ou atualizados</dt><dd>{summary.synced ?? '—'}</dd></div>
          <div><dt>Removidos da fonte</dt><dd>{summary.removed ?? '—'}</dd></div>
          <div><dt>Ignorados</dt><dd>{summary.skipped?.length ?? '—'}</dd></div>
          <div><dt>Falhas</dt><dd>{summary.errors?.length ?? '—'}</dd></div>
        </dl>
        {summary.skipped?.length > 0 && <div className="erp-merchant-results"><h3>Produtos que precisam de ajustes</h3><ul>{summary.skipped.map((item, index) => <li key={`${item.product}-${index}`}><strong>{item.product}:</strong> {item.reason}</li>)}</ul></div>}
        {summary.errors?.length > 0 && <div className="erp-merchant-results"><h3>Erros enviados pela API</h3><ul>{summary.errors.map((item, index) => <li key={`${item.product}-${index}`}><strong>{item.product}:</strong> {item.reason}</li>)}</ul></div>}
      </section>}

      <section className="erp-bling-card">
        <div className="erp-bling-card-heading"><div><span className="eyebrow">Importante</span><h2>O que esperar após o envio</h2></div></div>
        <p>O Google pode levar alguns minutos para processar os dados. O envio não garante aprovação ou exibição imediata: confira os diagnósticos e eventuais exigências diretamente no Merchant Center.</p>
      </section>
    </div>
  );
}
