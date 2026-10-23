/*
  Who gets which parts of ARISE.

  Two products share one app. Coaching clients pay $750 a month for Colby
  personally; Follow My Split members pay $16.99 to train on his program. The
  difference is everything that needs him: messages, calls, weekly check-ins,
  and meal logging he reviews. A member gets the program, the calendar, logging
  their sessions, steps, progress and the leaderboard — and none of the things
  that would put hundreds of people in his inbox.

  Members can be 13 to 17. For them the app also leaves out weigh-ins and
  progress photos: the program does not need a minor's body weight or photos
  of their body, and the safest copy of that data is the one never collected.

  Pure, so the rules can be tested without a database or a request.
*/

export type Tier = 'coaching' | 'program';

export const MIN_AGE = 13;
export const ADULT_AGE = 18;

export type Feature =
  | 'messages'
  | 'booking'
  | 'checkIn'
  | 'nutrition'
  | 'weight'
  | 'photos'
  | 'habits';

/** Sections a member never sees, in nav order with the routes that serve them. */
export const FEATURE_ROUTES: Record<Feature, string[]> = {
  messages: ['/messages'],
  booking: ['/book'],
  checkIn: ['/check-in'],
  nutrition: ['/nutrition', '/recipes'],
  weight: [],
  photos: [],
  habits: [],
};

export function tierOf(raw: string | null | undefined): Tier {
  return raw === 'program' ? 'program' : 'coaching';
}

/**
 * Whole years old on `today`. Both are calendar dates at UTC midnight, the
 * shape a `@db.Date` column round-trips and the shape `todayIn` returns.
 */
export function ageOn(birthDate: Date, today: Date): number {
  let age = today.getUTCFullYear() - birthDate.getUTCFullYear();
  const beforeBirthday =
    today.getUTCMonth() < birthDate.getUTCMonth() ||
    (today.getUTCMonth() === birthDate.getUTCMonth() && today.getUTCDate() < birthDate.getUTCDate());
  if (beforeBirthday) age -= 1;
  return age;
}

/**
 * Reads the date of birth from the signup form.
 *
 * Refused rather than guessed: a typo that makes somebody 140, or a date in
 * the future, is not an age, and the whole point of asking is the under-13
 * line.
 */
export function parseBirthDate(
  raw: unknown,
  today: Date
): { ok: true; date: Date; age: number } | { ok: false; reason: string } {
  if (typeof raw !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: false, reason: 'Enter your date of birth.' };
  }
  const date = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== raw) {
    return { ok: false, reason: "That date of birth didn't read." };
  }
  if (date.getTime() > today.getTime()) {
    return { ok: false, reason: "That date of birth is in the future." };
  }
  const age = ageOn(date, today);
  if (age > 100) return { ok: false, reason: "That date of birth didn't read." };
  if (age < MIN_AGE) {
    return { ok: false, reason: `You need to be at least ${MIN_AGE} to join.` };
  }
  return { ok: true, date, age };
}

export function isMinor(birthDate: Date | null | undefined, today: Date): boolean {
  if (!birthDate) return false;
  return ageOn(birthDate, today) < ADULT_AGE;
}

/**
 * What this person's app includes.
 *
 * A coaching client gets everything, whatever their age — that relationship
 * comes with a signed agreement and the coach's own judgement. A member gets
 * the training product; a member under 18 also goes without weigh-ins and
 * progress photos. A member with no birth date on file is treated as a minor:
 * the cautious default for the one case that should never happen.
 */
export function featuresFor(
  client: { tier?: string | null; birthDate?: Date | null } | null | undefined,
  today: Date
): Record<Feature, boolean> {
  if (tierOf(client?.tier) === 'coaching') {
    return {
      messages: true,
      booking: true,
      checkIn: true,
      nutrition: true,
      weight: true,
      photos: true,
      habits: true,
    };
  }
  const adult = client?.birthDate ? !isMinor(client.birthDate, today) : false;
  return {
    messages: false,
    booking: false,
    checkIn: false,
    nutrition: false,
    habits: false,
    weight: adult,
    photos: adult,
  };
}

/** Nav hrefs this person should not be shown. */
export function hiddenRoutes(features: Record<Feature, boolean>): string[] {
  return (Object.keys(FEATURE_ROUTES) as Feature[])
    .filter((f) => !features[f])
    .flatMap((f) => FEATURE_ROUTES[f]);
}

/**
 * The offer page's address. Lowercase letters, numbers and dashes, because it
 * goes in a bio link people type by hand.
 */
export function normalizeSlug(raw: string): string | null {
  const slug = raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug.length >= 2 && slug.length <= 40 ? slug : null;
}

/**
 * Dollars to Stripe's cents without float drift — $16.99 * 100 is
 * 1698.9999999999998 in JavaScript.
 */
export function toCents(raw: string | number): number | null {
  const text = String(raw).replace(/[$,\s]/g, '');
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const [whole, frac = ''] = text.split('.');
  const cents = Number(whole) * 100 + Number(frac.padEnd(2, '0'));
  return cents >= 100 && cents <= 100000 ? cents : null;
}

/** The share of looks that became paying members, as a whole percent. */
export function conversionPercent(visitors: number, paid: number): number | null {
  if (visitors <= 0) return null;
  return Math.round((paid / visitors) * 1000) / 10;
}
