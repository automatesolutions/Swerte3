import { describe, expect, it } from 'vitest';
import { isValidPhilippineMobile, normalizePhilippinePhone } from './phPhone';
import { userNeedsProfile, type UserMe } from './api';
import { cleanError, errorStatus, parseIsoDate, toIsoDate } from './dates';

describe('Philippine mobile numbers', () => {
  it('normalizes local and international formats', () => {
    expect(normalizePhilippinePhone('09171234567')).toBe('+639171234567');
    expect(normalizePhilippinePhone('+63 917 123 4567')).toBe('+639171234567');
    expect(normalizePhilippinePhone('9171234567')).toBe('+639171234567');
  });

  it('rejects numbers that are not PH mobiles', () => {
    expect(isValidPhilippineMobile('0217123456')).toBe(false);
    expect(isValidPhilippineMobile('12345')).toBe(false);
    expect(isValidPhilippineMobile('+15551234567')).toBe(false);
  });
});

describe('profile gate', () => {
  const base: UserMe = { phone: '+639171234567', display_alias: 'Lucky_Juan', premium_credits: 0 };

  it('passes a complete profile', () => {
    expect(userNeedsProfile({ ...base, needs_profile: false })).toBe(false);
  });

  it('sends placeholder phones, missing aliases and guests to Profile', () => {
    expect(userNeedsProfile({ ...base, is_placeholder_phone: true })).toBe(true);
    expect(userNeedsProfile({ ...base, display_alias: '  ' })).toBe(true);
    expect(userNeedsProfile({ ...base, is_guest_bootstrap: true })).toBe(true);
  });
});

describe('dates and errors', () => {
  it('round-trips ISO dates in local time', () => {
    const d = parseIsoDate('2026-10-03')!;
    expect(toIsoDate(d)).toBe('2026-10-03');
    expect(parseIsoDate('not a date')).toBeNull();
  });

  it('strips the status prefix from API errors', () => {
    const e = new Error('402: Kailangan mag-GINTO');
    expect(errorStatus(e)).toBe(402);
    expect(cleanError(e, 'fallback')).toBe('Kailangan mag-GINTO');
    expect(cleanError(new Error(''), 'fallback')).toBe('fallback');
  });
});
