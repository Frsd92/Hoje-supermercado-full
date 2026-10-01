export function hasTransparentPixels(imageData) {
  for (let index = 3; index < imageData.data.length; index += 4) {
    if (imageData.data[index] < 255) return true;
  }
  return false;
}

export function encodeProductImage(canvas, context, maximumLength = 1_600_000) {
  const transparent = hasTransparentPixels(context.getImageData(0, 0, canvas.width, canvas.height));
  let currentCanvas = canvas;
  let encodedImage;

  do {
    if (transparent) {
      encodedImage = currentCanvas.toDataURL('image/png');
    } else {
      const webpImage = currentCanvas.toDataURL('image/webp', 0.82);
      encodedImage = webpImage.startsWith('data:image/webp')
        ? webpImage
        : currentCanvas.toDataURL('image/png');
    }

    if (encodedImage.length <= maximumLength) return encodedImage;
    if (Math.max(currentCanvas.width, currentCanvas.height) <= 256) break;

    const scale = Math.max(0.5, Math.min(0.8, 256 / Math.max(currentCanvas.width, currentCanvas.height)));
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = Math.max(1, Math.round(currentCanvas.width * scale));
    resizedCanvas.height = Math.max(1, Math.round(currentCanvas.height * scale));
    const resizedContext = resizedCanvas.getContext('2d');
    if (!resizedContext) throw new Error('Não foi possível redimensionar a imagem para salvar.');
    resizedContext.drawImage(currentCanvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
    currentCanvas = resizedCanvas;
  } while (true);

  throw new Error('A imagem não pôde ser reduzida o suficiente. Escolha uma imagem menor.');
}
