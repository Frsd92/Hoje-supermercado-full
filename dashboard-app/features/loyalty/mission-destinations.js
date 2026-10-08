export const loyaltyMissionDestinationOptions = [
  { value: '', label: 'Página inicial da loja' },
  { value: '/categoria.html?categoria=ofertas', label: 'Ofertas em destaque' },
  { value: '/categoria.html?categoria=ofertas-relampago', label: 'Ofertas Relâmpago' },
  { value: '/categoria.html?categoria=hortifruti', label: 'Hortifruti' },
  { value: '/categoria.html?categoria=carnes', label: 'Carnes' },
  { value: '/categoria.html?categoria=padaria', label: 'Padaria' },
  { value: '/categoria.html?categoria=laticinios', label: 'Laticínios' },
  { value: '/categoria.html?categoria=mercearia', label: 'Mercearia' },
  { value: '/categoria.html?categoria=bomboniere', label: 'Bomboniere' },
  { value: '/categoria.html?categoria=sucos', label: 'Sucos e refrigerantes' },
  { value: '/categoria.html?categoria=bebidas', label: 'Bebidas' },
  { value: '/categoria.html?categoria=alcoolicas', label: 'Bebidas alcoólicas' },
  { value: '/categoria.html?categoria=vinhos', label: 'Vinhos' },
  { value: '/categoria.html?categoria=limpeza', label: 'Limpeza' },
  { value: '/categoria.html?categoria=lavanderia', label: 'Lavanderia' },
  { value: '/categoria.html?categoria=higiene', label: 'Higiene pessoal' },
  { value: '/categoria.html?categoria=pet', label: 'Pet Shop' },
  { value: '/categoria.html?categoria=bebes', label: 'Bebês' },
];

const allowedDestinationPaths = new Set(
  loyaltyMissionDestinationOptions.filter(({ value }) => value).map(({ value }) => value),
);

export function normalizeLoyaltyMissionDestinationPath(value) {
  const destinationPath = String(value ?? '').trim();
  if (!destinationPath) return null;
  if (!allowedDestinationPaths.has(destinationPath)) {
    throw new RangeError('Selecione uma página de destino válida.');
  }
  return destinationPath;
}

export function getLoyaltyMissionDestinationHref(value) {
  return allowedDestinationPaths.has(value) ? value : '/index.html';
}
