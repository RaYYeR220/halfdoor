import { describe, expect, test } from 'vitest';
import { checkedAtLabel } from '@/components/enclave/EnclaveStatus';

describe('EnclaveStatus "checked at"', () => {
  const iso = '2026-11-24T15:07:00Z';
  test("follows the demo clock and the church's time zone like every other sandbox time", () => {
    // 15:07 UTC is 9:07 in Chicago; a demo church shifted by -2 days +0:02 reads 9:09.
    expect(checkedAtLabel(iso, 'en', { tz: 'America/Chicago', shiftMs: 0 })).toBe('9:07 AM');
    expect(checkedAtLabel(iso, 'en', { tz: 'America/Chicago', shiftMs: -2 * 86_400_000 + 2 * 60_000 })).toBe('9:09 AM');
    expect(checkedAtLabel(iso, 'es', { tz: 'America/Chicago', shiftMs: 0 })).toMatch(/^9:07/);
  });
  test('an unreadable time is shown as given', () => {
    expect(checkedAtLabel('not a time', 'en')).toBe('not a time');
  });
});
