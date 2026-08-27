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

export { parseHealthPayload } from '@/lib/health-payload';
export type { HealthReading } from '@/lib/health-payload';
