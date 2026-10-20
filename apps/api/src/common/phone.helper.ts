export function normalizePhone(phone: string): string {
  const trimmed = phone.trim();
  if (trimmed.startsWith('+')) {
    return trimmed;
  }
  if (/^\d{10}$/.test(trimmed)) {
    return `+91${trimmed}`;
  }
  if (/^91\d{10}$/.test(trimmed)) {
    return `+${trimmed}`;
  }
  return trimmed;
}
