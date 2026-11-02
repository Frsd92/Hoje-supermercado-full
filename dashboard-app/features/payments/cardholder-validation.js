function normalizeCardholderName(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleUpperCase('pt-BR')
    .replace(/[^\p{L}\p{N}]/gu, '');
}

export function cardholderNameMatchesProfile(cardholderName, profileName) {
  const normalizedCardholderName = normalizeCardholderName(cardholderName);
  const normalizedProfileName = normalizeCardholderName(profileName);
  return Boolean(normalizedCardholderName && normalizedProfileName && normalizedCardholderName === normalizedProfileName);
}
