'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, CheckCircle2, ExternalLink, Link2, Unplug } from 'lucide-react';

const callbackStatuses = {
  connected: { type: 'success', message: 'Conta Bling conectada com sucesso.' },
  'login-required': { type: 'error', message: 'A sessão do ERP expirou. Entre novamente e refaça a conexão.' },
  'invalid-state': { type: 'error', message: 'Não foi possível validar a autorização. Inicie a conexão novamente.' },
  'authorization-denied': { type: 'error', message: 'A autorização foi cancelada ou recusada no Bling.' },
  'missing-code': { type: 'error', message: 'O Bling não retornou o código de autorização esperado.' },
  'connection-failed': { type: 'error', message: 'Não foi possível concluir a conexão. Verifique as configurações OAuth e tente novamente.' },
};

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(date);
}

export default function BlingIntegrationPage() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/erp/bling/status', { cache: 'no-store' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível carregar o status da integração.');
      setStatus(data);
    } catch (loadError) {
      setError(loadError.message || 'Não foi possível carregar o status da integração.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    const callbackStatus = new URLSearchParams(window.location.search).get('status');
    if (callbackStatus && callbackStatuses[callbackStatus]) {
      const result = callbackStatuses[callbackStatus];
      if (result.type === 'success') setNotice(result.message);
      else setError(result.message);
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [loadStatus]);

  const disconnect = async () => {
    if (!window.confirm('Desconectar a conta Bling deste ERP? Os pedidos já enviados continuarão registrados.')) return;
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/erp/bling/status', { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Não foi possível desconectar o Bling.');
      setNotice('Conta Bling desconectada.');
      await loadStatus();
    } catch (disconnectError) {
      setError(disconnectError.message || 'Não foi possível desconectar o Bling.');
    } finally {
      setWorking(false);
    }
  };

  const readyItems = status ? [
    ['Credenciais OAuth', status.hasClientCredentials],
    ['URL de retorno', status.hasRedirectUri],
    ['Chave de criptografia', status.hasEncryptionKey],
  ] : [];

  return (
    <div className="erp-bling-page">
      <header className="erp-customer-header">
        <div>
          <span className="eyebrow">Integrações</span>
          <h1>Bling</h1>
          <p>Conecte sua conta para emitir automaticamente NFC-e no Bling após a confirmação de pagamentos online pela Pagar.me.</p>
        </div>
      </header>

      {error && <p className="erp-bling-message error" role="alert"><AlertCircle size={17} />{error}</p>}
      {notice && <p className="erp-bling-message success" role="status"><CheckCircle2 size={17} />{notice}</p>}

      <section className="erp-bling-card" aria-labelledby="erp-bling-connection-title">
        <div className="erp-bling-card-heading">
          <div><span className="eyebrow">Conexão</span><h2 id="erp-bling-connection-title">{loading ? 'Verificando...' : status?.connected ? 'Conta conectada' : 'Conta não conectada'}</h2></div>
          <span className={`erp-bling-state${status?.connected ? ' connected' : ''}`}>{loading ? 'Verificando' : status?.connected ? 'Conectado' : 'Desconectado'}</span>
        </div>
        <p>Para pagamentos online confirmados pela Pagar.me, o ERP cria o pedido de venda e solicita automaticamente a emissão da NFC-e no Bling. A nota é enviada para autorização da SEFAZ; o resultado fica registrado no pedido.</p>

        {status?.connected && <dl className="erp-bling-details">
          <div><dt>Conectado em</dt><dd>{formatDate(status.connectedAt)}</dd></div>
          <div><dt>Expiração do token atual</dt><dd>{formatDate(status.accessTokenExpiresAt)} (renovado automaticamente)</dd></div>
        </dl>}

        {!loading && (!status?.connected || !status?.configured) && <div className="erp-bling-setup">
          <h3>{status?.configured ? 'Configuração necessária' : 'Configuração incompleta'}</h3>
          <ul>{readyItems.map(([label, ready]) => <li className={ready ? 'ready' : ''} key={label}>
            {ready ? <CheckCircle2 size={16} aria-hidden="true" /> : <AlertCircle size={16} aria-hidden="true" />}
            <span>{label}</span><strong>{ready ? 'Configurado' : 'Pendente'}</strong>
          </li>)}</ul>
          {status?.redirectUri && <p>Cadastre exatamente esta URL como retorno OAuth no aplicativo Bling:</p>}
          {status?.redirectUri && <code className="erp-bling-callback">{status.redirectUri}</code>}
        </div>}

        <div className="erp-bling-actions">
          {!status?.connected && status?.configured && <a className="primary-cta" href="/api/erp/bling/connect">
            <Link2 size={17} aria-hidden="true" />Conectar ao Bling
          </a>}
          {!status?.connected && !status?.configured && <button type="button" className="primary-cta" disabled>
            <Link2 size={17} aria-hidden="true" />Conectar ao Bling
          </button>}
          {status?.connected && <button type="button" className="secondary-cta" disabled={working} onClick={() => void disconnect()}>
            <Unplug size={17} aria-hidden="true" />{working ? 'Desconectando...' : 'Desconectar'}
          </button>}
          <button type="button" className="secondary-cta" disabled={loading || working} onClick={() => void loadStatus()}>Atualizar status</button>
        </div>
        {!loading && !status?.configured && <p className="erp-bling-hint">Configure as variáveis de ambiente do Bling no servidor. A URL de retorno deve ser HTTPS (ou localhost em desenvolvimento) e terminar em <code>/api/erp/bling/callback</code>.</p>}
      </section>

      <section className="erp-bling-card" aria-labelledby="erp-bling-manual-title">
        <div className="erp-bling-card-heading"><div><span className="eyebrow">Certificado digital</span><h2 id="erp-bling-manual-title">Cadastre o A1 diretamente no Bling</h2></div><ExternalLink size={20} aria-hidden="true" /></div>
        <p>O certificado A1 e sua senha não devem ser enviados nem armazenados no ERP Hoje. Cadastre-os na própria conta Bling para configurar a emissão fiscal.</p>
        <ol>
          <li>No Bling, abra <strong>Todas as configurações</strong>.</li>
          <li>Acesse <strong>Certificado Digital → Configurações de certificado digital</strong>.</li>
          <li>Escolha <strong>A1 – Servidor</strong> e siga as instruções da plataforma.</li>
        </ol>
      </section>
    </div>
  );
}
