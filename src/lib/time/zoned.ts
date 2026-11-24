// Wall-clock arithmetic in a named time zone with Intl only (no date library). Plain data, server and client.

export type ZonedParts = { y: number; m: number; d: number; wd: number; h: number; min: number };

/** Year, month (1-12), day, weekday (0 = Sunday), hour and minute of `d` on the wall clock in `tz` (UTC if unknown). */
export function zonedParts(d: Date, tz: string): ZonedParts {
  let f: Intl.DateTimeFormat;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23',
    });
  } catch {
    return zonedParts(d, 'UTC');
  }
  const p = Object.fromEntries(f.formatToParts(d).map((x) => [x.type, x.value]));
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday);
  return { y: Number(p.year), m: Number(p.month), d: Number(p.day), wd, h: Number(p.hour), min: Number(p.minute) };
}

/** The instant when the wall clock in `tz` reads y-m-d hh:mm. */
export function zonedTime(y: number, m: number, d: number, hh: number, mm: number, tz: string): number {
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const offsetAt = (t: number) => {
    const p = zonedParts(new Date(t), tz);
    return Date.UTC(p.y, p.m - 1, p.d, p.h, p.min) - Math.floor(t / 60_000) * 60_000;
  };
  const first = guess - offsetAt(guess);
  return guess - offsetAt(first); // second pass settles a DST edge
}

/** Midnight at the start of `now`'s calendar day in `tz`. */
export function startOfZonedDay(now: Date, tz: string): Date {
  const p = zonedParts(now, tz);
  return new Date(zonedTime(p.y, p.m, p.d, 0, 0, tz));
}
