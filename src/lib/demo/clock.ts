// The demo church's clock. A sandbox's services are created relative to the moment it was made ("9:00 service"
// starts 5 minutes before), so their real times rarely match their labels or fall on a Sunday. Sandbox pages show
// every time shifted by one offset, chosen so that the first of today's services starts at its label time on a
// Sunday: check-in reads 9:02, the buddy's opening "Sun 9:04 – 10:10 AM". Real churches use 0.
// Plain data, no React: server pages compute the offset, client components apply it when formatting.
import { zonedParts, zonedTime } from '@/lib/time/zoned';

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/**
 * "Today" in a sandbox: its two services start 5 min before and 115 min after it was made, and it lives 24 h. Its
 * past Sundays are whole weeks back, so +/-36 h holds today's services and nothing else.
 */
export const SANDBOX_TODAY_SPAN_MS = 36 * HOUR;

/** Whether a sandbox service is one of "today's" (see SANDBOX_TODAY_SPAN_MS). */
export const isSandboxToday = (startsAt: Date, now: Date) => Math.abs(startsAt.getTime() - now.getTime()) <= SANDBOX_TODAY_SPAN_MS;

type Svc = { label: string; startsAt: Date };

/** Milliseconds to add to every time a sandbox page shows (0 when no labelled service is near `now`). */
export function demoClockShift(services: readonly Svc[], now: Date, tz: string): number {
  const today = services
    .filter((s) => isSandboxToday(s.startsAt, now) && /^\d{1,2}:\d{2}/.test(s.label))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (!today) return 0;
  const [, hh, mm] = /^(\d{1,2}):(\d{2})/.exec(today.label)!;
  const local = zonedParts(today.startsAt, tz);
  const sunday = new Date(Date.UTC(local.y, local.m - 1, local.d) - local.wd * DAY);
  const target = zonedTime(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), Number(hh), Number(mm), tz);
  return target - today.startsAt.getTime();
}
