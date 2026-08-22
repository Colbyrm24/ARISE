import { createHash, randomBytes, timingSafeEqual } from 'crypto';
import { prisma } from '@/lib/prisma';

/*
  Letting a phone post its own health data.

  StepLog.source has existed since the first schema and has only ever held
  "manual", because nothing could write anything else. There's no native app
  and no HealthKit permission to read from, so the honest route is the one
  people already use for this: an iOS Shortcut or Health Auto Export posting
  to a URL on a schedule.

  That URL needs to authenticate without a login, which means a bearer token.
  It's deliberately narrow — it can write steps and bodyweight for exactly one
  client and can read nothing at all — so a token sitting in a Shortcut on
  somebody's phone is not worth stealing.
*/

/** Base64url, so it survives being pasted into a Shortcut without escaping. */
export function generateHealthToken() {
  return randomBytes(24).toString('base64url');
}

export function hashHealthToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Looks a token up in constant time.
 *
 * The hash lookup is indexed and would be fine on its own, but the compare
 * below is done with timingSafeEqual anyway. It costs nothing and it means
 * this doesn't become the one place in the app where a timing side channel
 * quietly exists.
 */
export async function clientIdForToken(token: string): Promise<string | null> {
  if (!token || token.length < 20 || token.length > 128) return null;

  const hash = hashHealthToken(token);
  const row = await prisma.healthToken.findUnique({ where: { tokenHash: hash } });
  if (!row) return null;

  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(row.tokenHash, 'hex');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return row.clientId;
}

/**
 * Issues a token, replacing any the client already had.
 *
 * Returns the plaintext, which is the only time it exists in readable form —
 * only the hash is stored, so a lost token is reissued rather than recovered.
 */
export async function issueHealthToken(clientId: string) {
  const token = generateHealthToken();
  const tokenHash = hashHealthToken(token);

  await prisma.healthToken.upsert({
    where: { clientId },
    create: { clientId, tokenHash },
    update: { tokenHash, lastUsedAt: null },
  });

  return token;
}

export type HealthPayload = {
  /** ISO date, or omitted for today. */
  date?: string;
  steps?: number;
  /** Kilograms or pounds — whatever the client's own logging already uses. */
  weight?: number;
};

/**
 * Validates one posted reading.
 *
 * Health exports are messy: they send strings for numbers, they send zero for
 * a day that hasn't happened, and they retry. Anything that doesn't parse is
 * dropped rather than stored, because a bad number in a weight chart is worse
 * than a missing one.
 */
export function parseHealthPayload(body: unknown): { date: Date; steps?: number; weight?: number } | null {
  if (!body || typeof body !== 'object') return null;
  const b = body as Record<string, unknown>;

  const date = new Date(typeof b.date === 'string' && b.date ? b.date : Date.now());
  if (Number.isNaN(date.getTime())) return null;
  date.setHours(0, 0, 0, 0);

  // More than a day in the future is a clock problem, not a reading.
  if (date.getTime() > Date.now() + 86400000) return null;

  const out: { date: Date; steps?: number; weight?: number } = { date };

  const steps = Number(b.steps);
  // Zero steps is almost always an export firing before the day started, and
  // storing it would overwrite a real count from the same day.
  if (Number.isFinite(steps) && steps > 0 && steps <= 200000) out.steps = Math.round(steps);

  const weight = Number(b.weight);
  // Wide enough for kg or lbs, narrow enough to reject a stray sensor value.
  if (Number.isFinite(weight) && weight >= 20 && weight <= 700) {
    out.weight = Math.round(weight * 100) / 100;
  }

  if (out.steps === undefined && out.weight === undefined) return null;
  return out;
}
