// Foto de la máquina: se reduce a ~800 px de lado mayor y se guarda como JPEG (data URL) para ocupar poco.
export async function shrinkImage(file, maxSide = 800, quality = 0.78) {
  if (!file?.type?.startsWith('image/')) throw new Error('El fichero no es una imagen.');
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return canvas.toDataURL('image/jpeg', quality);
}
