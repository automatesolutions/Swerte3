export function toIsoDate(d: Date): string {
  const y = d.getFullYear();
  const mo = d.getMonth() + 1;
  const day = d.getDate();
  return `${y}-${String(mo).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function parseIsoDate(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatFriendly(iso: string): string {
  const d = parseIsoDate(iso);
  if (!d) return iso;
  return d.toLocaleDateString('en-PH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

/** Strip the "401: " status prefix that api.ts adds to error messages. */
export function cleanError(e: unknown, fallback: string): string {
  const raw = e instanceof Error ? e.message : '';
  const msg = raw.replace(/^\d{3}:\s*/, '').trim();
  if (!msg) return fallback;
  return msg.length > 220 ? fallback : msg;
}

export function errorStatus(e: unknown): number | null {
  const m = /^(\d{3}):/.exec(e instanceof Error ? e.message : '');
  return m ? Number(m[1]) : null;
}
