const blockedTerms = [
  'arrombado',
  'babaca',
  'bicha',
  'bosta',
  'buceta',
  'cacete',
  'cagao',
  'canalha',
  'caralho',
  'corno',
  'desgracado',
  'fdp',
  'foda-se',
  'foder',
  'fodido',
  'filho da puta',
  'idiota',
  'imbecil',
  'merda',
  'otario',
  'pqp',
  'porra',
  'puta',
  'puto',
  'retardado',
  'vai tomar no cu',
  'vai se foder',
  'vagabundo',
  'viado',
  'xoxota',
];

function normalizeModerationText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[0]/g, 'o')
    .replace(/([a-z0-9])[1!|](?=[a-z0-9])/g, '$1i')
    .replace(/[3]/g, 'e')
    .replace(/[4@]/g, 'a')
    .replace(/[5$]/g, 's')
    .replace(/[7]/g, 't')
    .replace(/([a-z0-9])\1+/g, '$1')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function containsOffensiveContent(value) {
  const normalizedText = ` ${normalizeModerationText(value)} `;
  if (normalizedText === '  ') return false;

  return blockedTerms.some((term) => {
    const normalizedTerm = normalizeModerationText(term);
    return normalizedText.includes(` ${normalizedTerm} `);
  });
}

const contentModeration = { containsOffensiveContent };

if (typeof module !== 'undefined' && module.exports) {
  module.exports = contentModeration;
}

if (typeof window !== 'undefined') {
  window.hojeContentModeration = contentModeration;
}
