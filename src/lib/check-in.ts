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
 * Monday of the week a date falls in, normalized to UTC midnight so the same
 * week always produces the same key no matter when it's submitted.
 */
export function weekOf(date = new Date()) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dow = d.getUTCDay(); // 0 = Sunday
  const back = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - back);
  return d;
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
