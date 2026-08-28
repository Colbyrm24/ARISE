import { todayFor, type HasProfile } from '@/lib/day';

export type CheckInQuestion = {
  key: string;
  label: string;
  type: 'scale' | 'text';
  hint?: string;
};

/**
 * The weekly check-in. Deliberately short — a long form gets skipped, and a
 * skipped check-in tells the coach nothing. Four numbers to spot a trend at a
 * glance, two boxes for the part a number can't carry.
 */
export const CHECK_IN_QUESTIONS: CheckInQuestion[] = [
  { key: 'adherence', label: 'How closely did you hit your plan?', type: 'scale' },
  { key: 'energy', label: 'Energy levels', type: 'scale' },
  { key: 'sleep', label: 'Sleep quality', type: 'scale' },
  { key: 'hunger', label: 'Hunger', type: 'scale', hint: '1 = starving, 10 = never hungry' },
  {
    key: 'obstacles',
    label: 'What got in the way this week?',
    type: 'text',
  },
  {
    key: 'needs',
    label: 'Anything you need from me?',
    type: 'text',
  },
];

export const SCALE_KEYS = CHECK_IN_QUESTIONS.filter((q) => q.type === 'scale').map((q) => q.key);

/**
 * Monday of the week a given day falls in.
 *
 * Takes a day *label* — the UTC-midnight stamp of somebody's local calendar
 * date, as `todayIn`/`todayFor` produce — and walks it back to Monday. The
 * result is another label, which is what CheckIn.weekOf stores (@db.Date).
 *
 * This used to read the server's own UTC date instead, and so filed a
 * check-in by wherever the server happened to be standing. A client on the
 * west coast submitting on a Sunday evening was already Monday in UTC, so
 * their answers landed in *next* week: their coach's "this week" queue
 * showed nothing submitted, and the client's own screen showed an empty
 * form for a week they had just filled in.
 */
export function weekOf(day: Date): Date {
  const d = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
}

/** The current week for a particular person, in their own timezone. */
export function weekOfFor(u: HasProfile, now: Date = new Date()): Date {
  return weekOf(todayFor(u, now));
}

export function formatWeek(d: Date) {
  const end = new Date(d.getTime() + 6 * 86400000);
  const f = (x: Date) =>
    x.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${f(d)} – ${f(end)}`;
}

export type CheckInAnswers = Record<string, string | number>;

export function readAnswers(json: unknown): CheckInAnswers {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  return json as CheckInAnswers;
}
