export const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

export function readImageFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo escolhido.'));
    reader.onload = () => resolve(String(reader.result || ''));
    reader.readAsDataURL(file);
  });
}

export function loadImage(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onerror = () => reject(new Error('O arquivo escolhido não é uma imagem válida.'));
    image.onload = () => resolve(image);
    image.src = source;
  });
}

export function prepareImageData(image, { maxDimension = 1800, maxEncodedLength = 3_300_000 } = {}) {
  const initialScale = Math.min(1, maxDimension / Math.max(image.width, image.height));
  let canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * initialScale));
  canvas.height = Math.max(1, Math.round(image.height * initialScale));
  let context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a imagem para envio.');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const transparent = context.getImageData(0, 0, canvas.width, canvas.height).data.some((value, index) => index % 4 === 3 && value < 255);

  while (true) {
    const imageData = transparent
      ? canvas.toDataURL('image/png')
      : canvas.toDataURL('image/webp', 0.84);
    if (imageData.length <= maxEncodedLength) return imageData;
    if (Math.max(canvas.width, canvas.height) <= 320) {
      throw new Error('A imagem ficou muito grande mesmo após a compressão. Escolha uma imagem menor.');
    }

    const scale = Math.max(0.65, Math.min(0.82, 1400 / Math.max(canvas.width, canvas.height)));
    const resizedCanvas = document.createElement('canvas');
    resizedCanvas.width = Math.max(1, Math.round(canvas.width * scale));
    resizedCanvas.height = Math.max(1, Math.round(canvas.height * scale));
    const resizedContext = resizedCanvas.getContext('2d');
    if (!resizedContext) throw new Error('Não foi possível comprimir a imagem.');
    resizedContext.drawImage(canvas, 0, 0, resizedCanvas.width, resizedCanvas.height);
    canvas = resizedCanvas;
  }
}
