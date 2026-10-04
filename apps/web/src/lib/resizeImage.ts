const MAX_EDGE = 1600;
const QUALITY = 0.85;

/** a phone camera photo can pass 5 MB. this keeps uploads small on a prepaid data bundle */
export async function resizeImage(file: File, maxEdge = MAX_EDGE): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.type === 'image/jpeg') return file;

    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) return file;
    const name = file.name.replace(/\.[^.]*$/, '') + '.jpg';
    return new File([blob], name, { type: 'image/jpeg' });
  } finally {
    bitmap.close();
  }
}
