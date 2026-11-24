// Dates and times on the parent page, always in the church's time zone so the server render and the browser
// agree. "Today 9:02 – 10:14 AM", "Yesterday 4:12 PM", "Sun 9:02 – 10:14 AM", "Sun, Nov 15, 9:02 – 10:14 AM".
import type { Lang, Translate } from '@/lib/i18n';

/** `shiftMs`: the demo church's clock offset (lib/demo/clock), added to every time shown, `now` included. */
export type WhenCtx = { lang: Lang; tz: string; now: Date; t: Translate; shiftMs?: number };

const LOCALE: Record<Lang, string> = { en: 'en-US', es: 'es-419' };
const DAY = 86_400_000;

function fmt(lang: Lang, tz: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  try {
    return new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: tz });
  } catch {
    return new Intl.DateTimeFormat(LOCALE[lang], { ...opts, timeZone: 'UTC' });
  }
}

/** Calendar day in the zone, as a UTC midnight timestamp (for day differences). */
function dayStamp(d: Date, tz: string): number {
  const p = fmt('en', tz, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
  const get = (type: string) => Number(p.find((x) => x.type === type)?.value);
  return Date.UTC(get('year'), get('month') - 1, get('day'));
}

const shifted = (d: Date, shiftMs = 0) => (shiftMs ? new Date(d.getTime() + shiftMs) : d);

/** Whole calendar days from `d` to `now` in the zone (0 = same day, 1 = yesterday). */
export function daysAgo(d: Date, ctx: Pick<WhenCtx, 'tz' | 'now' | 'shiftMs'>): number {
  return Math.round((dayStamp(shifted(ctx.now, ctx.shiftMs), ctx.tz) - dayStamp(shifted(d, ctx.shiftMs), ctx.tz)) / DAY);
}

/**
 * "Today", "Yesterday", "Sun" (this past week), else "Sun, Nov 15" (plus the year when it differs).
 * `inline` for mid-sentence use: "Approved today".
 */
export function dayLabel(date: Date, ctx: WhenCtx, inline = false): string {
  const n = daysAgo(date, ctx);
  const d = shifted(date, ctx.shiftMs);
  const now = shifted(ctx.now, ctx.shiftMs);
  if (n === 0) return ctx.t(inline ? 'parent.when.todayInline' : 'parent.when.today');
  if (n === 1) return ctx.t(inline ? 'parent.when.yesterdayInline' : 'parent.when.yesterday');
  if (n > 1 && n < 7) return fmt(ctx.lang, ctx.tz, { weekday: 'short' }).format(d);
  const sameYear = fmt('en', ctx.tz, { year: 'numeric' }).format(d) === fmt('en', ctx.tz, { year: 'numeric' }).format(now);
  return fmt(ctx.lang, ctx.tz, { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) }).format(d);
}

/** "9:02 AM", or a range "9:02 – 10:14 AM" when `end` is given and later. */
export function timeLabel(start: Date, end: Date | null, ctx: Pick<WhenCtx, 'lang' | 'tz' | 'shiftMs'>): string {
  const f = fmt(ctx.lang, ctx.tz, { hour: 'numeric', minute: '2-digit' });
  const a = shifted(start, ctx.shiftMs);
  if (!end || end.getTime() <= start.getTime()) return f.format(a);
  return f.formatRange(a, shifted(end, ctx.shiftMs));
}

/** Day and time together: "Today 9:02 – 10:14 AM". A range that crosses midnight keeps only the start. */
export function whenLabel(start: Date, end: Date | null, ctx: WhenCtx): string {
  const sameDay = end ? dayStamp(shifted(start, ctx.shiftMs), ctx.tz) === dayStamp(shifted(end, ctx.shiftMs), ctx.tz) : true;
  const day = dayLabel(start, ctx);
  const sep = daysAgo(start, ctx) >= 7 ? ', ' : ' ';
  return `${day}${sep}${timeLabel(start, sameDay ? end : null, ctx)}`;
}
