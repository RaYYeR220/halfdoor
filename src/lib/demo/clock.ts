// The demo church's clock. A sandbox's services are created relative to the moment it was made ("9:00 service"
// starts 5 minutes before), so their real times rarely match their labels or fall on a Sunday. Sandbox pages show
// every time shifted by one offset, chosen so that the first of today's services starts at its label time on a
// Sunday: check-in reads 9:02, the buddy's opening "Sun 9:04 – 10:10 AM". Real churches use 0.
// Plain data, no React: server pages compute the offset, client components apply it when formatting.

const HOUR = 3600_000;
const DAY = 24 * HOUR;
/** "Today" in a sandbox: its services start 5 min before and 115 min after it was made, its past ones whole weeks back. */
const TODAY_SPAN = 36 * HOUR;

type Svc = { label: string; startsAt: Date };

function parts(d: Date, tz: string): { y: number; m: number; d: number; wd: number; h: number; min: number } {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' });
  } catch {
    return parts(d, 'UTC');
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd, h: Number(p.hour), min: Number(p.minute) };
}

/** The instant when the wall clock in `tz` reads y-m-d hh:mm. */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (t: number) => {
    const p = parts(new Date(t), tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(t / 60_000) * 60_000;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first); // second pass settles a DST edge
}

/** Milliseconds to add to every time a sandbox page shows (0 when no labelled service is near `now`). */
export function demoClockShift(services: readonly Svc[], now: Date, tz: string): number {
  const today = services
    .filter((s) => Math.abs(s.startsAt.getTime() - now.getTime()) <= TODAY_SPAN && /^\d{1,2}:\d{2}/.test(s.label))
    .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())[0];
  if (!today) return 0;
  const [, hh, mm] = /^(\d{1,2}):(\d{2})/.exec(today.label)!;
  const local = parts(today.startsAt, tz);
  const sunday = new Date(Date.UTC(local.y, local.m - 1, local.d) - local.wd * DAY);
  const target = zonedTime(sunday.getUTCFullYear(), sunday.getUTCMonth() + 1, sunday.getUTCDate(), Number(hh), Number(mm), tz);
  return target - today.startsAt.getTime();
}
