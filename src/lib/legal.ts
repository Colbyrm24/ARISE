/*
  The handful of facts the privacy policy and the terms both state, in one
  place.

  These are the only lines on either page that are about ARISE-the-business
  rather than ARISE-the-software, and they are the lines that go wrong: a
  policy that names the wrong operator or an old support address is worse than
  no policy, because it is a written promise to somebody about who they are
  dealing with.

  Everything below is fact, not drafting, and should be confirmed by whoever
  reviews these pages before real clients are onboarded.
*/

/** Who the client is contracting with. A legal entity name goes here if one exists. */
export const OPERATOR = 'Colby Mullins';

/** Where a client writes about their data. This address has to be watched. */
export const CONTACT_EMAIL = 'colbymullins24@gmail.com';

/**
 * The state whose law governs, and whose courts hear a dispute.
 *
 * Null on purpose rather than guessed. When null, the governing-law clause
 * still reads correctly — it just doesn't name a state — so these pages are
 * publishable before this is settled. Fill it in (e.g. 'Florida') once the
 * business's home state is confirmed, and the clause tightens itself.
 */
export const GOVERNING_STATE: string | null = null;

/**
 * When the current version of these pages took effect.
 *
 * Bump this whenever either page changes in a way a client would care about.
 * It is the one thing on the page a person uses to tell whether they are
 * reading what they agreed to.
 */
export const LEGAL_EFFECTIVE = 'October 23, 2026';

/** Formatted for the line under each title. */
export const effectiveLine = `Effective ${LEGAL_EFFECTIVE}`;
