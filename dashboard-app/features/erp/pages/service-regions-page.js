'use client';

import { useEffect, useState } from 'react';
import { MapPin, Plus, RefreshCw } from 'lucide-react';

const regionsApi = '/api/erp/service-regions';

export default function ServiceRegionsPage() {
  const [states, setStates] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [feedbackIsError, setFeedbackIsError] = useState(false);
  const [newStateUf, setNewStateUf] = useState('');
  const [newMunicipality, setNewMunicipality] = useState('');

  const loadRegions = async () => {
    const response = await fetch(regionsApi, { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as regiões.');
    if (!Array.isArray(result.states)) throw new Error('A resposta das regiões está inválida.');
    setStates(result.states);
    setLoadError('');
  };

  useEffect(() => {
    let active = true;
    fetch(regionsApi, { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar as regiões.');
        if (!Array.isArray(result.states)) throw new Error('A resposta das regiões está inválida.');
        return result.states;
      })
      .then((nextStates) => {
        if (!active) return;
        setStates(nextStates);
        setLoadError('');
      })
      .catch((error) => {
        if (active) setLoadError(error.message);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });
    return () => { active = false; };
  }, []);

  const saveChange = async (method, body, successMessage) => {
    if (isSaving) return false;
    setIsSaving(true);
    setFeedback('');
    setFeedbackIsError(false);
    try {
      const response = await fetch(regionsApi, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Não foi possível atualizar as regiões.');
      setFeedback(successMessage);
      try {
        await loadRegions();
      } catch (error) {
        setLoadError(error.message);
        setFeedback(`${successMessage} A lista não pôde ser atualizada; tente recarregá-la.`);
        setFeedbackIsError(true);
      }
      return true;
    } catch (error) {
      setFeedback(error.message);
      setFeedbackIsError(true);
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const addMunicipality = async (event) => {
    event.preventDefault();
    if (!newStateUf || !newMunicipality.trim()) return;
    const saved = await saveChange('POST', { stateUf: newStateUf, name: newMunicipality }, 'Município liberado para cadastro de endereços.');
    if (saved) setNewMunicipality('');
  };

  const enabledStates = states.filter((state) => state.enabled);

  return (
    <div className="erp-page service-region-page">
      <header className="erp-customer-header service-region-header">
        <div>
          <span className="eyebrow">Operação</span>
          <h1>Regiões atendidas</h1>
          <p>Controle os estados e municípios em que clientes podem cadastrar endereços e finalizar pedidos.</p>
        </div>
        <MapPin size={26} aria-hidden="true" />
      </header>

      <section className="service-region-instructions">
        <strong>Como funciona</strong>
        <p>Ative o estado e, em seguida, os municípios atendidos. Um endereço só será aceito quando ambos estiverem liberados.</p>
      </section>

      {feedback && <p className={`service-region-feedback ${feedbackIsError ? 'error' : 'success'}`} role={feedbackIsError ? 'alert' : 'status'}>{feedback}</p>}

      <form className="service-region-add-form" onSubmit={addMunicipality}>
        <label>
          Estado liberado
          <select value={newStateUf} onChange={(event) => setNewStateUf(event.target.value)} required disabled={isSaving || !enabledStates.length}>
            <option value="">Selecione um estado</option>
            {enabledStates.map((state) => <option key={state.uf} value={state.uf}>{state.name} ({state.uf})</option>)}
          </select>
        </label>
        <label>
          Município
          <input
            value={newMunicipality}
            onChange={(event) => setNewMunicipality(event.target.value)}
            placeholder="Ex.: Campinas"
            maxLength={120}
            required
            disabled={isSaving || !enabledStates.length}
          />
        </label>
        <button type="submit" className="primary-cta" disabled={isSaving || !enabledStates.length}>
          <Plus size={16} /> Liberar município
        </button>
        {!enabledStates.length && <p className="service-region-form-help">Ative um estado para poder adicionar municípios.</p>}
      </form>

      <div className="service-region-list-heading">
        <h2>Estados e municípios</h2>
        <span>{states.filter((state) => state.enabled).length} estados liberados</span>
      </div>

      {isLoading ? (
        <div className="service-region-empty"><RefreshCw size={18} /> Carregando regiões...</div>
      ) : loadError ? (
        <div className="service-region-empty error" role="alert">
          <p>{loadError}</p>
          <button type="button" className="supplier-secondary-button" onClick={() => {
            setIsLoading(true);
            loadRegions().catch((error) => setLoadError(error.message)).finally(() => setIsLoading(false));
          }}>Tentar novamente</button>
        </div>
      ) : (
        <div className="service-region-state-list">
          {states.map((state) => (
            <section className={`service-region-state-card ${state.enabled ? 'is-enabled' : ''}`} key={state.uf}>
              <div className="service-region-state-heading">
                <div>
                  <h3>{state.name} <span>{state.uf}</span></h3>
                  <p>{state.enabled ? state.municipalities.filter((municipality) => municipality.enabled).length : 0} municípios ativos</p>
                </div>
                <label className="service-region-switch">
                  <input
                    type="checkbox"
                    checked={state.enabled}
                    onChange={(event) => void saveChange('PATCH', { stateUf: state.uf, enabled: event.target.checked }, `Estado ${state.name} atualizado.`)}
                    disabled={isSaving}
                  />
                  <span>{state.enabled ? 'Estado ativo' : 'Estado inativo'}</span>
                </label>
              </div>
              {state.municipalities.length ? (
                <ul className="service-region-municipality-list">
                  {state.municipalities.map((municipality) => (
                    <li key={municipality.id}>
                      <span>{municipality.name}</span>
                      <label className="service-region-switch compact">
                        <input
                          type="checkbox"
                          checked={municipality.enabled}
                          onChange={(event) => void saveChange('PATCH', { municipalityId: municipality.id, enabled: event.target.checked }, `Município ${municipality.name} atualizado.`)}
                          disabled={isSaving || (!state.enabled && !municipality.enabled)}
                        />
                        <span>{state.enabled ? (municipality.enabled ? 'Ativo' : 'Inativo') : (municipality.enabled ? 'Estado inativo' : 'Inativo')}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="service-region-no-municipalities">Nenhum município cadastrado neste estado.</p>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
