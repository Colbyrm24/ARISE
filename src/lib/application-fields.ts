/*
  The coaching application, as data.

  Shared by the form on /coaching/apply (a client component) and the zod
  schema the API route validates with. Deliberately free of zod itself so the
  form doesn't ship a validation library to a phone just to check that a
  first name isn't empty — the server re-checks everything anyway.
*/

export type Choice = { value: string; label: string };

export const AGE_RANGES: Choice[] = [
  { value: 'under_28', label: 'Under 28' },
  { value: '28_34', label: '28–34' },
  { value: '35_44', label: '35–44' },
  { value: '45_50', label: '45–50' },
  { value: 'over_50', label: 'Over 50' },
];

export const EXPERIENCE: Choice[] = [
  { value: 'none', label: "I've never trained consistently" },
  { value: 'on_off', label: 'On and off for years' },
  { value: 'consistent', label: 'Training consistently, not seeing results' },
  { value: 'advanced', label: '3+ years in, and stuck' },
];

export const START_WHEN: Choice[] = [
  { value: 'now', label: 'Right now' },
  { value: 'two_weeks', label: 'Within 2 weeks' },
  { value: 'month', label: 'Within a month' },
  { value: 'looking', label: 'Just looking for now' },
];

export const INVEST_READY: Choice[] = [
  { value: 'yes', label: "Yes. If it's the right fit, I'm in." },
  { value: 'more_info', label: 'I need to know more first' },
  { value: 'no', label: 'No, not right now' },
];

/** Every status a coach can put an application in, in pipeline order. */
export const APPLICATION_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'call_booked', label: 'Call booked' },
  { value: 'joined', label: 'Joined' },
  { value: 'not_a_fit', label: 'Not a fit' },
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number]['value'];

export function isApplicationStatus(v: unknown): v is ApplicationStatus {
  return APPLICATION_STATUSES.some((s) => s.value === v);
}

/** The human label for a stored choice value, falling back to the raw value. */
export function labelFor(choices: readonly Choice[], value: string | null | undefined) {
  if (!value) return '';
  return choices.find((c) => c.value === value)?.label ?? value;
}

export const LIMITS = {
  firstName: 60,
  email: 200,
  longText: 1500,
} as const;

// Plain enough to catch typos, loose enough never to reject a real address.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(raw: string) {
  return raw.trim().toLowerCase();
}

export function isEmail(raw: string) {
  const v = normalizeEmail(raw);
  return v.length <= LIMITS.email && EMAIL.test(v);
}

/**
 * An Instagram handle from whatever people actually type: "@colby",
 * "colby", "instagram.com/colby/", "https://www.instagram.com/colby?igsh=…".
 *
 * Returns '' for empty input (it's optional) and null when what's left can't
 * be a handle — so the coach's instagram.com link never points at garbage.
 */
export function normalizeInstagram(raw: string): string | null {
  let v = raw.trim();
  if (!v) return '';
  const fromUrl = v.match(/instagram\.com\/([^/?#\s]+)/i);
  if (fromUrl) v = fromUrl[1]!;
  v = v.replace(/^@+/, '').replace(/\/+$/, '').toLowerCase();
  // Instagram's own rule: letters, numbers, periods, underscores, max 30,
  // and never starting or ending on a period.
  if (!/^[a-z0-9._]{1,30}$/.test(v) || v.startsWith('.') || v.endsWith('.')) return null;
  return v;
}

/**
 * A phone number in a form both tel: links and a human can use.
 *
 * Ten digits is read as a US number, since that's the audience; anything with
 * a leading + keeps its own country code. Returns '' for empty input and null
 * for something that isn't a phone number.
 */
export function normalizePhone(raw: string): string | null {
  const v = raw.trim();
  if (!v) return '';
  const plus = v.startsWith('+');
  const digits = v.replace(/\D/g, '');
  if (!plus && digits.length === 10) return `+1${digits}`;
  if (!plus && digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  if (plus && digits.length >= 8 && digits.length <= 15) return `+${digits}`;
  return null;
}

/** "+15551234567" -> "(555) 123-4567"; anything else is shown as stored. */
export function formatPhone(stored: string) {
  const m = stored.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : stored;
}

/** Where a visitor came from (?ref=ig), reduced to something safe to store. */
export function normalizeSource(raw: string | null | undefined) {
  const v = (raw ?? '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 40);
  return v || null;
}

export type ApplicationAnswers = {
  firstName: string;
  email: string;
  phone: string;
  instagram: string;
  ageRange: string;
  goal: string;
  obstacle: string;
  experience: string;
  startWhen: string;
  investReady: string;
};

export const EMPTY_ANSWERS: ApplicationAnswers = {
  firstName: '',
  email: '',
  phone: '',
  instagram: '',
  ageRange: '',
  goal: '',
  obstacle: '',
  experience: '',
  startWhen: '',
  investReady: '',
};

/**
 * The one-screen check for a single answer. Returns the message to show, or
 * null when the answer can move on. Same rules the server applies.
 */
export function checkAnswer(key: keyof ApplicationAnswers, value: string): string | null {
  const v = value.trim();
  switch (key) {
    case 'firstName':
      if (!v) return 'Your first name, so I know who I’m talking to.';
      return v.length > LIMITS.firstName ? 'That’s longer than a first name.' : null;
    case 'email':
      return isEmail(v) ? null : 'That email doesn’t look right.';
    case 'phone':
      return normalizePhone(v) === null ? 'That number doesn’t look right. Or leave it blank.' : null;
    case 'instagram':
      return normalizeInstagram(v) === null ? 'That handle doesn’t look right. Or leave it blank.' : null;
    case 'goal':
    case 'obstacle':
      if (v.length < 3) return 'A sentence is enough. Be honest.';
      return v.length > LIMITS.longText ? 'Keep it under 1,500 characters.' : null;
    case 'ageRange':
      return AGE_RANGES.some((c) => c.value === v) ? null : 'Pick one.';
    case 'experience':
      return EXPERIENCE.some((c) => c.value === v) ? null : 'Pick one.';
    case 'startWhen':
      return START_WHEN.some((c) => c.value === v) ? null : 'Pick one.';
    case 'investReady':
      return INVEST_READY.some((c) => c.value === v) ? null : 'Pick one.';
  }
}
