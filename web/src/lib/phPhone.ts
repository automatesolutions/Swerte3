/**
 * Philippine mobile validation aligned with backend `normalize_phone` (otp_service.py).
 * Valid = +63 followed by a 10-digit subscriber number starting with 9 (e.g. +639171234567).
 */

export function normalizePhilippinePhone(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const s = String(raw).normalize('NFKC').trim();
  if (!s || /^(null|none|undefined)$/i.test(s)) return null;
  const d = s.replace(/\D+/g, '');
  if (d.length < 10) return null;
  if (d.startsWith('63')) return `+${d}`;
  if (d.startsWith('0')) return `+63${d.slice(1)}`;
  if (d.startsWith('9') && d.length === 10) return `+63${d}`;
  return `+${d}`;
}

/** True if the value normalizes to a standard PH mobile (+63 9XX XXX XXXX). */
export function isValidPhilippineMobile(raw: string): boolean {
  const n = normalizePhilippinePhone(raw);
  if (!n?.startsWith('+')) return false;
  const digits = n.slice(1);
  if (!digits.startsWith('63')) return false;
  const subscriber = digits.slice(2);
  return subscriber.length === 10 && subscriber.startsWith('9');
}
