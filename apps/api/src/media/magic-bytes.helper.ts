export function validateMagicBytes(
  buffer: Buffer,
  contentType: string,
): boolean {
  if (buffer.length < 4) return false;

  const hex = buffer.toString('hex').toUpperCase();

  if (contentType === 'image/jpeg' || contentType === 'image/jpg') {
    // JPEG starts with FF D8 FF
    return hex.startsWith('FFD8FF');
  }

  if (contentType === 'image/png') {
    // PNG starts with 89 50 4E 47 0D 0A 1A 0A
    return hex.startsWith('89504E470D0A1A0A');
  }

  if (contentType === 'image/webp') {
    // WebP starts with RIFF (52 49 46 46) and WEBP (57 45 42 50) at bytes 8-11
    if (buffer.length < 12) return false;
    const isRiff = hex.startsWith('52494646'); // "RIFF"
    const webpHeader = buffer.subarray(8, 12).toString('ascii');
    return isRiff && webpHeader === 'WEBP';
  }

  return false;
}
