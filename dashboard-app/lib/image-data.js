const imageSignatures = {
  'image/png': 'iVBORw0KGgo',
  'image/jpeg': '/9j/',
  'image/webp': 'UklGR',
};

export function validateImageDataUrl(imageData, { maxBytes = 2_500_000 } = {}) {
  const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(imageData || ''));
  if (!match) return null;

  const encoded = match[2];
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const decodedLength = Math.floor(encoded.length * 3 / 4) - padding;
  if (encoded.length % 4 !== 0
    || !decodedLength
    || decodedLength > maxBytes
    || !encoded.startsWith(imageSignatures[match[1]])) return null;

  return { contentType: match[1], imageData: encoded };
}
