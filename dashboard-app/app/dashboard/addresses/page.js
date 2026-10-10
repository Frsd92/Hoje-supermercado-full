'use client';

import { Home, PencilLine, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { formatServiceRegions, getServiceRegionMatch } from '@/features/service-regions/region-utils';
import AccountPageNav from '../account-page-nav';

const addressesApi = '/api/addresses';
const deliveryAddressStorageKey = (email) => `hoje-dashboard-delivery-address-${email || 'guest'}`;

export default function AddressesPage() {
  const { data: session, status } = useSession();
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', stateCode: '', country: '', cep: '', type: 'Alternativo',
  });
  const [cepStatus, setCepStatus] = useState('');
  const [regionStatus, setRegionStatus] = useState('');
  const [regionMessage, setRegionMessage] = useState('');
  const [serviceRegions, setServiceRegions] = useState([]);
  const [serviceRegionsLoading, setServiceRegionsLoading] = useState(true);
  const [serviceRegionsError, setServiceRegionsError] = useState('');
  const [addressesError, setAddressesError] = useState('');
  const [addressActionError, setAddressActionError] = useState('');
  const [isSavingAddress, setIsSavingAddress] = useState(false);
  const cepLookupTimer = useRef(null);
  const cepLookupController = useRef(null);

  const cancelCepLookup = () => {
    window.clearTimeout(cepLookupTimer.current);
    cepLookupTimer.current = null;
    cepLookupController.current?.abort();
    cepLookupController.current = null;
  };

  useEffect(() => {
    let active = true;
    fetch('/api/service-regions', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível consultar as regiões atendidas.');
        if (!Array.isArray(result.states)) throw new Error('A resposta das regiões atendidas é inválida.');
        return result.states;
      })
      .then((states) => {
        if (!active) return;
        setServiceRegions(states);
        setServiceRegionsError('');
      })
      .catch((error) => {
        if (!active) return;
        setServiceRegionsError(error.message);
      })
      .finally(() => {
        if (active) setServiceRegionsLoading(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(addressesApi)
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Não foi possível carregar seus endereços.');
        if (!Array.isArray(result.addresses)) throw new Error('A resposta de endereços é inválida.');
        return result;
      })
      .then(({ addresses: savedAddresses = [] }) => {
        setAddresses(savedAddresses);
        setAddressesError('');
        const storageKey = deliveryAddressStorageKey(session?.user?.email);
        const storedId = localStorage.getItem(storageKey);
        const selected = savedAddresses.find((address) => String(address.id) === storedId)
          || savedAddresses.find((address) => address.type === 'Padrão')
          || savedAddresses[0];
        if (selected) {
          const selectedId = String(selected.id);
          setSelectedAddressId(selectedId);
          localStorage.setItem(storageKey, selectedId);
          window.dispatchEvent(new CustomEvent('dashboard-address-selected', { detail: { addressId: selectedId } }));
        } else {
          setSelectedAddressId('');
          localStorage.removeItem(storageKey);
          window.dispatchEvent(new CustomEvent('dashboard-address-selected', { detail: {} }));
        }
      })
      .catch((error) => {
        setAddresses([]);
        setAddressesError(error.message);
      });
  }, [status, session?.user?.email]);

  useEffect(() => () => {
    window.clearTimeout(cepLookupTimer.current);
    cepLookupController.current?.abort();
  }, []);

  const persistAddresses = async (nextAddresses) => {
    const response = await fetch(addressesApi, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: nextAddresses }),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Não foi possível salvar os endereços.');
    if (!Array.isArray(result.addresses)) throw new Error('O servidor não confirmou o salvamento dos endereços.');

    const savedAddresses = result.addresses;
    setAddresses(savedAddresses);
    const storageKey = deliveryAddressStorageKey(session?.user?.email);
    const currentSelectionExists = savedAddresses.some((address) => String(address.id) === selectedAddressId);
    if (!currentSelectionExists) {
      const selected = savedAddresses.find((address) => address.type === 'Padrão') || savedAddresses[0];
      const nextId = selected ? String(selected.id) : '';
      setSelectedAddressId(nextId);
      if (nextId) localStorage.setItem(storageKey, nextId);
      else localStorage.removeItem(storageKey);
    }
    window.dispatchEvent(new CustomEvent('dashboard-address-selected', {
      detail: {
        addressId: currentSelectionExists
          ? selectedAddressId
          : String(savedAddresses.find((address) => address.type === 'Padrão')?.id || savedAddresses[0]?.id || ''),
      },
    }));
  };

  const selectDeliveryAddress = (address) => {
    const addressId = String(address.id);
    setSelectedAddressId(addressId);
    localStorage.setItem(deliveryAddressStorageKey(session?.user?.email), addressId);
    window.dispatchEvent(new CustomEvent('dashboard-address-selected', { detail: { addressId } }));
  };

  const openCreateForm = () => {
    cancelCepLookup();
    setEditingId(null);
    setForm({
      title: '', street: '', number: '', complement: '', neighborhood: '', city: '', state: '', stateCode: '', country: '', cep: '', type: 'Alternativo',
    });
    setCepStatus('');
    setRegionStatus('');
    setRegionMessage('');
    setAddressActionError('');
    setIsFormOpen(true);
  };

  const openEditForm = (address) => {
    cancelCepLookup();
    setEditingId(address.id);
    setForm({
      ...address,
      number: address.number || '',
      complement: address.complement || '',
      neighborhood: address.neighborhood || '',
      state: address.state || '',
      stateCode: address.stateCode || '',
      country: address.country || '',
      cep: address.cep.replace(/^CEP:\s*/, ''),
    });
    setCepStatus('');
    setRegionStatus('');
    setRegionMessage('');
    setAddressActionError('');
    setIsFormOpen(true);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (['city', 'state', 'stateCode', 'country'].includes(name)) {
      setRegionStatus('');
      setRegionMessage('');
    }
    if (name !== 'cep') return;

    cancelCepLookup();
    setCepStatus('');
    setRegionStatus('');
    setRegionMessage('');
    const cep = value.replace(/\D/g, '');
    if (cep.length !== 8) return;

    cepLookupTimer.current = window.setTimeout(() => {
      cepLookupTimer.current = null;
      void lookupCep(cep);
    }, 300);
  };

  const lookupCep = async (value) => {
    const cep = String(value || '').replace(/\D/g, '');
    if (cep.length !== 8) return;

    const controller = new AbortController();
    cepLookupController.current = controller;
    setCepStatus('Buscando endereço...');
    setRegionStatus('checking');
    setRegionMessage('Verificando se atendemos neste município...');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
      if (!response.ok) throw new Error('Serviço de CEP indisponível.');
      const data = await response.json();
      if (controller.signal.aborted) return;

      if (data.erro) {
        setCepStatus('CEP não encontrado. Você pode preencher manualmente.');
        setRegionStatus('');
        setRegionMessage('');
        return;
      }

      const regionsResponse = await fetch('/api/service-regions', { cache: 'no-store', signal: controller.signal });
      const regionsResult = await regionsResponse.json();
      if (!regionsResponse.ok || !Array.isArray(regionsResult.states)) {
        throw new Error(regionsResult.error || 'Não foi possível verificar as regiões atendidas.');
      }
      if (controller.signal.aborted) return;
      setServiceRegions(regionsResult.states);
      setServiceRegionsError('');

      const addressRegion = {
        city: data.localidade || '',
        state: data.estado || data.uf || '',
        stateCode: data.uf || '',
        country: 'Brasil',
      };
      const regionMatch = getServiceRegionMatch(addressRegion, regionsResult.states);
      setRegionStatus(regionMatch.allowed ? 'allowed' : 'blocked');
      setRegionMessage(regionMatch.allowed
        ? `Atendemos em ${data.localidade} (${data.uf}).`
        : `Ainda não atendemos em ${data.localidade} (${data.uf}). Confira as regiões disponíveis acima.`);

      setForm((current) => {
        if (current.cep.replace(/\D/g, '') !== cep) return current;
        return {
          ...current,
          cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.estado || data.uf || '',
          stateCode: data.uf || '',
          country: 'Brasil',
        };
      });
      setCepStatus('Endereço encontrado.');
    } catch (error) {
      if (error.name === 'AbortError') return;
      setCepStatus('Não foi possível consultar agora. Preencha manualmente.');
      setRegionStatus('error');
      setRegionMessage('Não foi possível confirmar a cobertura pelo CEP. O servidor validará a região ao salvar.');
    } finally {
      if (cepLookupController.current === controller) cepLookupController.current = null;
    }
  };

  const saveAddress = async (event) => {
    event.preventDefault();
    if (isSavingAddress) return;
    if (!form.title.trim() || !form.street.trim() || !form.city.trim() || !form.cep.trim()) return;

    const savedAddress = {
      ...form,
      title: form.title.trim(),
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim(),
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      stateCode: form.stateCode.trim().toUpperCase(),
      country: form.country.trim(),
      cep: `CEP: ${form.cep.trim()}`,
    };

    const nextAddresses = editingId
      ? addresses.map((address) => address.id === editingId ? { ...address, ...savedAddress } : address)
      : [...addresses, { id: `address-${Date.now()}`, ...savedAddress }];

    setAddressActionError('');
    setIsSavingAddress(true);
    try {
      await persistAddresses(nextAddresses);
      setIsFormOpen(false);
    } catch (error) {
      setAddressActionError(error.message);
    } finally {
      setIsSavingAddress(false);
    }
  };

  const removeAddress = async (id) => {
    if (isSavingAddress) return;
    const nextAddresses = addresses.filter((address) => address.id !== id);
    setAddressActionError('');
    setIsSavingAddress(true);
    try {
      await persistAddresses(nextAddresses);
    } catch (error) {
      setAddressActionError(error.message);
    } finally {
      setIsSavingAddress(false);
    }
  };

  const servedRegions = formatServiceRegions(serviceRegions);

  return (
    <div className="section-shell addresses-page">
      <AccountPageNav current="addresses" />
      <div className="section-header addresses-header">
        <div>
          <span className="dashboard-page-eyebrow">Minha conta</span>
          <h1>Meus Endereços</h1>
          <p>Escolha onde receber seus pedidos e mantenha suas informações de entrega atualizadas.</p>
          {!addressesError && <span className="address-count">{addresses.length} {addresses.length === 1 ? 'endereço salvo' : 'endereços salvos'}</span>}
        </div>
        <button type="button" className="primary-cta" onClick={openCreateForm} disabled={isSavingAddress}><Plus size={17} /> Novo Endereço</button>
      </div>

      <aside className="service-area-notice" aria-live="polite" aria-busy={serviceRegionsLoading}>
        <div className="service-area-notice-icon" aria-hidden="true"><Home size={18} /></div>
        <div>
          <strong>Regiões atendidas</strong>
          {serviceRegionsLoading ? (
            <p>Consultando cidades disponíveis...</p>
          ) : serviceRegionsError ? (
            <p role="alert">Não foi possível consultar as regiões atendidas. {serviceRegionsError}</p>
          ) : (
            <p>{servedRegions.length
              ? servedRegions.join(', ')
              : 'Nenhuma cidade está liberada para entrega no momento.'}</p>
          )}
          <small>Em breve expandiremos para outras cidades e estados.</small>
        </div>
      </aside>

      {isFormOpen && (
        <form className="address-form panel-box" onSubmit={saveAddress}>
          <div className="panel-header compact">
            <div>
              <h3>{editingId ? 'Editar endereço' : 'Adicionar endereço'}</h3>
              <p>Preencha os dados para entrega.</p>
            </div>
            <button type="button" className="ghost-link" onClick={() => setIsFormOpen(false)} disabled={isSavingAddress}>Cancelar</button>
          </div>
          <div className="address-form-grid">
            <label>CEP<input name="cep" value={form.cep} onChange={handleChange} placeholder="00000-000" required /></label>
            <label>Tipo<select name="type" value={form.type} onChange={handleChange}><option>Padrão</option><option>Alternativo</option></select></label>
            <label className="address-form-wide">Identificação do endereço<input name="title" value={form.title} onChange={handleChange} placeholder="Casa, trabalho..." required /></label>
            <label className="address-form-wide">Rua<input name="street" value={form.street} onChange={handleChange} placeholder="Nome da rua" required /></label>
            <label className="address-form-wide">Número<input name="number" value={form.number} onChange={handleChange} placeholder="Ex.: 123 ou S/N" /></label>
            <label className="address-form-wide">Complemento (opcional)<input name="complement" value={form.complement} onChange={handleChange} placeholder="Apartamento, bloco, casa..." maxLength={120} /></label>
            <label className="address-form-wide">Bairro<input name="neighborhood" value={form.neighborhood} onChange={handleChange} placeholder="Nome do bairro" /></label>
            <label className="address-form-wide">Município<input name="city" value={form.city} onChange={handleChange} placeholder="Ex.: São Paulo" required /></label>
            <label>Estado<input name="state" value={form.state} onChange={handleChange} placeholder="Ex.: São Paulo" /></label>
            <label className="address-form-wide">País<input name="country" value={form.country} onChange={handleChange} placeholder="Ex.: Brasil" /></label>
          </div>
          {cepStatus && <p className={`cep-status ${cepStatus.startsWith('Endereço') ? 'success' : ''}`} role="status">{cepStatus}</p>}
          {regionMessage && <p className={`address-region-status ${regionStatus}`} role={regionStatus === 'blocked' ? 'alert' : 'status'}>{regionMessage}</p>}
          <button type="submit" className="primary-cta" disabled={isSavingAddress || regionStatus === 'blocked' || regionStatus === 'checking'}>
            {isSavingAddress ? 'Salvando...' : 'Salvar endereço'}
          </button>
        </form>
      )}
      {addressActionError && <p className="address-save-error" role="alert">{addressActionError}</p>}

      {addressesError ? (
        <div className="empty-state" role="alert">
          <h3>Não foi possível carregar seus endereços</h3>
          <p>{addressesError}</p>
        </div>
      ) : addresses.length === 0 ? (
        <div className="empty-state">
          <h3>Nenhum endereço cadastrado</h3>
          <p>Adicione um endereço de entrega para continuar.</p>
        </div>
      ) : (
        <div className="address-grid">
          {addresses.map((address) => (
            <div key={address.id} className={`address-card ${String(address.id) === selectedAddressId ? 'delivery-address-selected' : ''}`}>
              <div className="address-card-header">
                <div className="address-tag"><Home size={14} /> {address.title}</div>
                <div className="address-actions-inline">
                  <button type="button" className="icon-button-small" aria-label={`Editar endereço ${address.title}`} onClick={() => openEditForm(address)} disabled={isSavingAddress}><PencilLine size={14} /></button>
                  <button type="button" className="icon-button-small" aria-label={`Excluir endereço ${address.title}`} onClick={() => removeAddress(address.id)} disabled={isSavingAddress}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div>
                <p>{[address.street, address.number].filter(Boolean).join(', ')}</p>
                {address.complement && <p>Complemento: {address.complement}</p>}
                {address.neighborhood && <p>{address.neighborhood}</p>}
                <p>{address.city}</p>
                {(address.state || address.country) && <p>{[address.state, address.country].filter(Boolean).join(', ')}</p>}
                <p>{address.cep}</p>
              </div>

              <div className="default-setting">
                <span>{address.type}</span>
              </div>
              <button
                type="button"
                className="select-delivery-address"
                aria-pressed={String(address.id) === selectedAddressId}
                onClick={() => selectDeliveryAddress(address)}
              >
                {String(address.id) === selectedAddressId ? 'Endereço selecionado' : 'Usar para entrega'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
