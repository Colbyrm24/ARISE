/*
  Recognising "that row already exists".

  Most of the one-row-per-period rules in this app can be written as a Prisma
  `upsert`, because the constraint behind them is a plain compound unique that
  Prisma knows about. Two of them cannot: the active-habit rule and the synced
  nutrition rule are PARTIAL unique indexes — `WHERE active AND goal_type <>
  'custom'`, `WHERE source = 'apple_health'` — and Prisma's schema language has
  no way to express either, so it has no key to upsert against.

  For those, the insert is the check: try it, and if the database says the row
  is already there, update the existing one instead. That is the same
  conclusion the booking action reached, and it is strictly better than
  find-then-insert because there is no window between the two.

  The reason this is its own file rather than an inline `err.code === 'P2002'`
  at each site: the booking action got it wrong in the other direction. It
  treats EVERY failure as a conflict, so with the database unreachable it told
  clients every slot had just been taken — five slots, five times, and nothing
  logged. Naming the check makes the difference between "this row exists" and
  "the database is down" hard to skip.
*/

/** Postgres unique-constraint violation, as Prisma reports it. */
export function isUniqueViolation(err: unknown): boolean {
  return codeOf(err) === 'P2002';
}

/** Prisma's error code, if this is a Prisma error at all. */
export function codeOf(err: unknown): string | null {
  if (typeof err !== 'object' || err === null) return null;
  const code = (err as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}
