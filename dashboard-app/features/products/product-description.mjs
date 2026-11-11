export function parseProductDescription(value) {
  const text = String(value || '');
  const parts = [];
  const boldPattern = /\*\*(.+?)\*\*/gs;
  let lastIndex = 0;

  for (const match of text.matchAll(boldPattern)) {
    const index = match.index ?? 0;
    if (index > lastIndex) parts.push({ text: text.slice(lastIndex, index), bold: false });
    parts.push({ text: match[1], bold: true });
    lastIndex = index + match[0].length;
  }

  if (lastIndex < text.length) parts.push({ text: text.slice(lastIndex), bold: false });
  return parts;
}

export function getProductDescriptionText(value) {
  return parseProductDescription(value).map(({ text }) => text).join('');
}
