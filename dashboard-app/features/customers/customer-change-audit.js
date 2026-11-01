import { randomUUID } from 'node:crypto';

const profileFieldLabels = {
  fullName: 'Nome completo',
  whatsapp: 'WhatsApp',
  cpf: 'CPF',
  gender: 'Gênero',
  birthDate: 'Data de nascimento',
  photo: 'Foto do perfil',
  monthlyBudget: 'Orçamento mensal',
};

const addressFieldLabels = {
  title: 'Identificação',
  street: 'Logradouro',
  number: 'Número',
  complement: 'Complemento',
  neighborhood: 'Bairro',
  city: 'Cidade',
  state: 'Estado',
  stateCode: 'UF',
  cep: 'CEP',
  country: 'País',
  type: 'Tipo',
};

function normalizedValue(field, value) {
  if (field === 'cpf' || field === 'whatsapp') return String(value || '').replace(/\D/g, '');
  if (field === 'birthDate') return value ? new Date(value).toISOString().slice(0, 10) : '';
  if (field === 'monthlyBudget') return Number(value || 0);
  if (field === 'photo') return value || null;
  return String(value || '').trim();
}

export function getChangedCustomerProfileFields(previous, updates) {
  return Object.keys(profileFieldLabels).filter((field) => (
    Object.hasOwn(updates, field)
    && normalizedValue(field, previous?.[field]) !== normalizedValue(field, updates[field])
  )).map((field) => profileFieldLabels[field]);
}

export function getChangedCustomerAddressFields(previousAddresses, nextAddresses) {
  const previous = new Map(previousAddresses.map((address) => [String(address.id), address]));
  const next = new Map(nextAddresses.map((address) => [String(address.id), address]));
  const changes = [];

  for (const [id, address] of next) {
    const oldAddress = previous.get(id);
    if (!oldAddress) {
      changes.push(`Endereço adicionado${address.title ? `: ${address.title}` : ''}`);
      continue;
    }

    const changedFields = Object.keys(addressFieldLabels).filter((field) => (
      normalizedValue(field, oldAddress[field]) !== normalizedValue(field, address[field])
    ));
    if (changedFields.length) {
      const label = address.title || oldAddress.title || 'Endereço salvo';
      changes.push(`${label}: ${changedFields.map((field) => addressFieldLabels[field]).join(', ')}`);
    }
  }

  for (const [id, address] of previous) {
    if (!next.has(id)) changes.push(`Endereço removido${address.title ? `: ${address.title}` : ''}`);
  }

  return changes;
}

export function createCustomerChangeAuditRecord({ email, actorId = null, resourceName, action, fields, now = new Date() }) {
  if (!fields.length) return null;

  return {
    eventKey: `customer-profile:${randomUUID()}`,
    eventOrigin: 'CUSTOMER_PROFILE',
    occurredAt: now,
    actorId,
    actorLabel: 'Cliente',
    actorType: 'CUSTOMER',
    action,
    method: 'PUT',
    route: resourceName === 'CustomerAddressBook' ? '/api/addresses' : '/api/profile',
    resourceName,
    resourceId: email,
    deviceType: 'Desconhecido',
    browser: 'Desconhecido',
    operatingSystem: 'Desconhecido',
    queryKeys: [],
    outcome: 'RECORDED_CHANGE',
    changes: { fields },
    note: 'Alteração cadastral realizada pelo cliente.',
  };
}
