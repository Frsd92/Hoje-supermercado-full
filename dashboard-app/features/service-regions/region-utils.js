export function normalizeRegionText(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

export function findRegionState(states, value) {
  const normalized = normalizeRegionText(value);
  if (!normalized || !Array.isArray(states)) return null;
  return states.find((state) => (
    normalizeRegionText(state.uf) === normalized
    || normalizeRegionText(state.name) === normalized
  )) || null;
}

export function normalizeSavedAddress(address, states = []) {
  const cityValue = String(address?.city || '').trim();
  let city = cityValue;
  let neighborhood = String(address?.neighborhood || '').trim();

  if (!neighborhood) {
    const separator = city.indexOf(',');
    if (separator !== -1) {
      neighborhood = city.slice(0, separator).trim();
      city = city.slice(separator + 1).trim();
    }
  }

  const stateSuffix = city.match(/^(.*?)\s+-\s+([A-Z]{2})$/i);
  if (stateSuffix) city = stateSuffix[1].trim();
  const state = findRegionState(states, address?.stateCode)
    || findRegionState(states, address?.state)
    || findRegionState(states, stateSuffix?.[2]);

  return {
    ...address,
    number: String(address?.number || ''),
    complement: String(address?.complement || '').trim(),
    neighborhood,
    city,
    state: String(address?.state || state?.name || stateSuffix?.[2]?.toUpperCase() || ''),
    stateCode: String(state?.uf || stateSuffix?.[2] || address?.stateCode || '').toUpperCase(),
    country: String(address?.country || (address?.cep ? 'Brasil' : '')),
  };
}

export function getServiceRegionMatch(address, states) {
  const country = normalizeRegionText(address?.country);
  if (country && country !== 'brasil' && country !== 'brazil') {
    return { allowed: false, reason: 'country', state: null, municipality: null };
  }

  const stateCode = String(address?.stateCode || '').trim();
  const stateName = String(address?.state || '').trim();
  const stateFromCode = findRegionState(states, stateCode);
  const stateFromName = findRegionState(states, stateName);
  const state = stateFromName || stateFromCode;
  if (stateFromCode && stateFromName && stateFromCode.uf !== stateFromName.uf) {
    return { allowed: false, reason: 'state_mismatch', state, municipality: null };
  }
  if ((stateCode && !stateFromCode) || (stateName && !stateFromName)) {
    return { allowed: false, reason: 'state', state: state || null, municipality: null };
  }
  if (!state || state.enabled !== true) {
    return { allowed: false, reason: 'state', state: state || null, municipality: null };
  }

  const city = normalizeRegionText(address?.city || address?.municipality);
  const municipality = (Array.isArray(state.municipalities) ? state.municipalities : [])
    .find((entry) => entry.enabled === true && normalizeRegionText(entry.name) === city) || null;

  return municipality
    ? { allowed: true, reason: '', state, municipality }
    : { allowed: false, reason: 'municipality', state, municipality: null };
}

export function sameDeliveryRegion(first, second) {
  return normalizeRegionText(first?.stateCode) === normalizeRegionText(second?.stateCode)
    && normalizeRegionText(first?.state) === normalizeRegionText(second?.state)
    && normalizeRegionText(first?.city || first?.municipality) === normalizeRegionText(second?.city || second?.municipality)
    && normalizeRegionText(first?.country) === normalizeRegionText(second?.country);
}

export function formatServiceRegions(states) {
  return (Array.isArray(states) ? states : [])
    .flatMap((state) => (state.enabled === true && Array.isArray(state.municipalities)
      ? state.municipalities
        .filter((municipality) => municipality.enabled === true)
        .map((municipality) => `${municipality.name} (${state.uf})`)
      : []))
    .sort((first, second) => first.localeCompare(second, 'pt-BR'));
}

export function getServiceRegionError(address, match, states) {
  const servedRegions = formatServiceRegions(states);
  const currentCoverage = servedRegions.length ? servedRegions.join(', ') : 'nenhuma cidade liberada no momento';
  const expansionMessage = 'Em breve expandiremos para outras cidades e estados.';

  if (match.reason === 'country') {
    return `No momento, aceitamos endereços de entrega no Brasil. ${expansionMessage}`;
  }

  if (match.reason === 'state_mismatch') {
    return 'O estado e a UF do endereço não correspondem. Consulte o CEP novamente antes de salvar.';
  }

  if (match.reason === 'state') {
    const state = String(address?.state || address?.stateCode || '').trim();
    return `Ainda não atendemos no estado ${state || 'informado'}. Regiões atendidas: ${currentCoverage}. ${expansionMessage}`;
  }

  const city = String(address?.city || address?.municipality || '').trim();
  const stateUf = match.state?.uf || String(address?.stateCode || '').trim().toUpperCase();
  const location = [city, stateUf].filter(Boolean).join(' - ');
  return `Ainda não atendemos em ${location || 'neste município'}. Regiões atendidas: ${currentCoverage}. ${expansionMessage}`;
}
