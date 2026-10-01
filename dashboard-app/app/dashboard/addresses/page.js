'use client';

import { Home, PencilLine, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';

const addressesApi = '/api/addresses';
const deliveryAddressStorageKey = (email) => `hoje-dashboard-delivery-address-${email || 'guest'}`;

const initialAddresses = [
  {
    id: 1,
    title: 'Casa',
    type: 'Padrão',
    street: 'Rua das Flores, 123 - Apto 45',
    city: 'Centro, São Paulo - SP',
    cep: 'CEP: 01234-567',
  },
  {
    id: 2,
    title: 'Trabalho',
    type: 'Alternativo',
    street: 'Av. Paulista, 1000',
    city: 'Bela Vista, São Paulo - SP',
    cep: 'CEP: 01310-100',
  },
];

export default function AddressesPage() {
  const { data: session, status } = useSession();
  const [addresses, setAddresses] = useState(initialAddresses);
  const [selectedAddressId, setSelectedAddressId] = useState('');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', street: '', city: '', cep: '', type: 'Alternativo' });
  const [cepStatus, setCepStatus] = useState('');

  useEffect(() => {
    if (status !== 'authenticated') return;
    fetch(addressesApi)
      .then((response) => response.json())
      .then(({ addresses: savedAddresses = [] }) => {
        setAddresses(savedAddresses);
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
      .catch(() => setAddresses(initialAddresses));
  }, [status, session?.user?.email]);

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
    setEditingId(null);
    setForm({ title: '', street: '', city: '', cep: '', type: 'Alternativo' });
    setCepStatus('');
    setIsFormOpen(true);
  };

  const openEditForm = (address) => {
    setEditingId(address.id);
    setForm({ ...address, cep: address.cep.replace(/^CEP:\s*/, '') });
    setCepStatus('');
    setIsFormOpen(true);
  };

  const handleChange = (event) => {
    const { name, value } = event.target;
    setForm((current) => ({ ...current, [name]: value }));
  };

  const lookupCep = async () => {
    const cep = form.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;

    setCepStatus('Buscando endereço...');
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const data = await response.json();

      if (data.erro) {
        setCepStatus('CEP não encontrado. Você pode preencher manualmente.');
        return;
      }

      setForm((current) => ({
        ...current,
        cep: `${cep.slice(0, 5)}-${cep.slice(5)}`,
        street: data.logradouro || current.street,
        city: [data.bairro, data.localidade && data.uf ? `${data.localidade} - ${data.uf}` : data.localidade]
          .filter(Boolean)
          .join(', '),
      }));
      setCepStatus('Endereço encontrado.');
    } catch {
      setCepStatus('Não foi possível consultar agora. Preencha manualmente.');
    }
  };

  const saveAddress = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.street.trim() || !form.city.trim() || !form.cep.trim()) return;

    const savedAddress = {
      ...form,
      title: form.title.trim(),
      street: form.street.trim(),
      city: form.city.trim(),
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
    <div className="section-shell">
      <div className="section-header">
        <div>
          <h1>Meus Endereços</h1>
          <p>Gerencie seus endereços de entrega</p>
        </div>
        <button type="button" className="primary-cta" onClick={openCreateForm}>+ Novo Endereço</button>
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
            <label>CEP<input name="cep" value={form.cep} onChange={handleChange} onBlur={lookupCep} placeholder="00000-000" required /></label>
            <label>Tipo<select name="type" value={form.type} onChange={handleChange}><option>Padrão</option><option>Alternativo</option></select></label>
            <label>Complemento<input name="title" value={form.title} onChange={handleChange} placeholder="Apto 45, casa..." /></label>
            <label className="address-form-wide">Rua e número<input name="street" value={form.street} onChange={handleChange} placeholder="Rua, número e complemento" required /></label>
            <label>Bairro, cidade e estado<input name="city" value={form.city} onChange={handleChange} placeholder="Bairro, cidade - UF" required /></label>
          </div>
          {cepStatus && <p className={`cep-status ${cepStatus.startsWith('Endereço') ? 'success' : ''}`}>{cepStatus}</p>}
          <button type="submit" className="primary-cta">Salvar endereço</button>
        </form>
      )}

      {addresses.length === 0 ? (
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
                <p>{address.street}</p>
                <p>{address.city}</p>
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
