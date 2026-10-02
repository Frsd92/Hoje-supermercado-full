'use client';

import { Home, PencilLine, Plus, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';

const addressesApi = '/api/addresses';
const deliveryAddressStorageKey = (email) => `hoje-dashboard-delivery-address-${email || 'guest'}`;

export default function AddressesPage() {
  const { data: session, status } = useSession();
  const [addresses, setAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({
    title: '', street: '', number: '', neighborhood: '', city: '', state: '', country: '', cep: '', type: 'Alternativo',
  });
  const [cepStatus, setCepStatus] = useState('');
  const [addressesError, setAddressesError] = useState('');
  const cepLookupTimer = useRef(null);
  const cepLookupController = useRef(null);

  const cancelCepLookup = () => {
    window.clearTimeout(cepLookupTimer.current);
    cepLookupTimer.current = null;
    cepLookupController.current?.abort();
    cepLookupController.current = null;
  };

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(addressesApi)
      .then((response) => {
        if (!response.ok) throw new Error('Não foi possível carregar seus endereços.');
        return response.json();
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
    setAddresses(nextAddresses);
    const response = await fetch(addressesApi, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addresses: nextAddresses }),
    });
    if (!response.ok) throw new Error('Não foi possível salvar os endereços.');
    const storageKey = deliveryAddressStorageKey(session?.user?.email);
    const currentSelectionExists = nextAddresses.some((address) => String(address.id) === selectedAddressId);
    if (!currentSelectionExists) {
      const selected = nextAddresses.find((address) => address.type === 'Padrão') || nextAddresses[0];
      const nextId = selected ? String(selected.id) : '';
      setSelectedAddressId(nextId);
      if (nextId) localStorage.setItem(storageKey, nextId);
      else localStorage.removeItem(storageKey);
    }
    window.dispatchEvent(new CustomEvent('dashboard-address-selected', {
      detail: { addressId: currentSelectionExists ? selectedAddressId : String(nextAddresses.find((address) => address.type === 'Padrão')?.id || nextAddresses[0]?.id || '') },
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
      title: '', street: '', number: '', neighborhood: '', city: '', state: '', country: '', cep: '', type: 'Alternativo',
    });
    setCepStatus('');
    setIsFormOpen(true);
  };

  const openEditForm = (address) => {
    cancelCepLookup();
    setEditingId(address.id);
    setForm({
      ...address,
      number: address.number || '',
      neighborhood: address.neighborhood || '',
      state: address.state || '',
      country: address.country || '',
      cep: address.cep.replace(/^CEP:\s*/, ''),
    });
    setCepStatus('');
    setIsFormOpen(true);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
    if (name !== 'cep') return;

    cancelCepLookup();
    setCepStatus('');
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
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal });
      if (!response.ok) throw new Error('Serviço de CEP indisponível.');
      const data = await response.json();
      if (controller.signal.aborted) return;

      if (data.erro) {
        setCepStatus('CEP não encontrado. Você pode preencher manualmente.');
        return;
      }

      setForm((current) => {
        if (current.cep.replace(/\D/g, '') !== cep) return current;
        return {
          ...current,
          cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
          street: data.logradouro || current.street,
          neighborhood: data.bairro || '',
          city: data.localidade || '',
          state: data.estado || data.uf || '',
          country: 'Brasil',
        };
      });
      setCepStatus('Endereço encontrado.');
    } catch (error) {
      if (error.name === 'AbortError') return;
      setCepStatus('Não foi possível consultar agora. Preencha manualmente.');
    } finally {
      if (cepLookupController.current === controller) cepLookupController.current = null;
    }
  };

  const saveAddress = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.street.trim() || !form.city.trim() || !form.cep.trim()) return;

    const savedAddress = {
      ...form,
      title: form.title.trim(),
      street: form.street.trim(),
      number: form.number.trim(),
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      country: form.country.trim(),
      cep: `CEP: ${form.cep.trim()}`,
    };

    const nextAddresses = editingId
      ? addresses.map((address) => address.id === editingId ? { ...address, ...savedAddress } : address)
      : [...addresses, { id: `address-${Date.now()}`, ...savedAddress }];
    persistAddresses(nextAddresses).catch(() => setAddresses(addresses));
    setIsFormOpen(false);
  };

  const removeAddress = (id) => {
    const nextAddresses = addresses.filter((address) => address.id !== id);
    persistAddresses(nextAddresses).catch(() => setAddresses(addresses));
  };

  return (
    <div className="section-shell addresses-page">
      <div className="section-header addresses-header">
        <div>
          <h1>Meus Endereços</h1>
          <p>Gerencie seus endereços de entrega</p>
        </div>
        <button type="button" className="primary-cta" onClick={openCreateForm}><Plus size={17} /> Novo Endereço</button>
      </div>

      {isFormOpen && (
        <form className="address-form panel-box" onSubmit={saveAddress}>
          <div className="panel-header compact">
            <div>
              <h3>{editingId ? 'Editar endereço' : 'Adicionar endereço'}</h3>
              <p>Preencha os dados para entrega.</p>
            </div>
            <button type="button" className="ghost-link" onClick={() => setIsFormOpen(false)}>Cancelar</button>
          </div>
          <div className="address-form-grid">
            <label>CEP<input name="cep" value={form.cep} onChange={handleChange} placeholder="00000-000" required /></label>
            <label>Tipo<select name="type" value={form.type} onChange={handleChange}><option>Padrão</option><option>Alternativo</option></select></label>
            <label className="address-form-wide">Identificação do endereço<input name="title" value={form.title} onChange={handleChange} placeholder="Casa, trabalho..." required /></label>
            <label className="address-form-wide">Rua<input name="street" value={form.street} onChange={handleChange} placeholder="Nome da rua" required /></label>
            <label className="address-form-wide">Número<input name="number" value={form.number} onChange={handleChange} placeholder="Ex.: 123 ou S/N" /></label>
            <label className="address-form-wide">Bairro<input name="neighborhood" value={form.neighborhood} onChange={handleChange} placeholder="Nome do bairro" /></label>
            <label className="address-form-wide">Município<input name="city" value={form.city} onChange={handleChange} placeholder="Ex.: São Paulo" required /></label>
            <label>Estado<input name="state" value={form.state} onChange={handleChange} placeholder="Ex.: São Paulo" /></label>
            <label className="address-form-wide">País<input name="country" value={form.country} onChange={handleChange} placeholder="Ex.: Brasil" /></label>
          </div>
          {cepStatus && <p className={`cep-status ${cepStatus.startsWith('Endereço') ? 'success' : ''}`} role="status">{cepStatus}</p>}
          <button type="submit" className="primary-cta">Salvar endereço</button>
        </form>
      )}

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
                  <button type="button" className="icon-button-small" aria-label="Editar endereço" onClick={() => openEditForm(address)}><PencilLine size={14} /></button>
                  <button type="button" className="icon-button-small" aria-label="Excluir endereço" onClick={() => removeAddress(address.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>

              <div>
                <p>{[address.street, address.number].filter(Boolean).join(', ')}</p>
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
