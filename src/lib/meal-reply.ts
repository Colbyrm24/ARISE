/*
  The line the coach actually sends back.

  Confirming a photo already updates the client's day, but that was never the
  part that took the time. The time goes into opening Messages, finding the
  thread, and typing out the same shape of sentence forty times a day. So the
  queue writes it, in his voice, and he sends or edits it without leaving the
  screen.

  Three rules, taken from how he actually texts:

  - The number comes first. No "that comes out to about" — the figure is the
    first thing on the line.
  - Exactly one question at the end, and it looks forward rather than back at
    the plate.
  - Never narrate the photo back at them. "Grilled chicken and rice, nice
    choice" is the single clearest tell that a coach didn't write it.
*/

/** Closers, rotated so forty meals in a day don't all end the same way. */
const CLOSERS = [
  'Whats the rest of today looking like food wise?',
  'How we doing on the rest of the day?',
  'Energy feelin good today?',
  'What else has gone in so far?',
  'Hows the body feeling today?',
  'Whats the plan for dinner?',
];

/**
 * Picked off the row id rather than at random.
 *
 * This text lands in an editable box. If the closer changed every time the
 * page re-rendered, a coach halfway through editing would watch the sentence
 * rewrite itself under the cursor.
 */
function closerFor(id: string, meal: string | null) {
  // "Whats the plan for dinner" is only sensible before dinner.
  const pool = meal === 'dinner' ? CLOSERS.slice(0, 5) : CLOSERS;
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) % 100003;
  return pool[n % pool.length];
}

/** Whole numbers. Nobody texts a client "47.3g protein". */
function r(n: number) {
  return Math.round(n);
}

export type ReplyInput = {
  id: string;
  meal: string | null;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** Set when the read failed, so the line asks instead of asserting. */
  failed?: boolean;
};

export function macroReply({ id, meal, calories, protein, carbs, fat, failed }: ReplyInput) {
  if (failed) {
    // No numbers to give. Asking for the detail is the honest move — inventing
    // a figure here is how a client ends up eating to a number nobody read.
    return `Couldnt get a clear read on that one my man. Roughly how much was on the plate and Ill get you the numbers. ${closerFor(id, meal)}`;
  }

  const macros = `About ${r(calories)} calories ${r(protein)}g protein ${r(carbs)}g carbs ${r(fat)}g fat.`;

  // One observation, only when the plate genuinely earns it. A line that fires
  // on every meal stops carrying information.
  let note = '';
  if (protein >= 60) {
    note = ` ${r(protein)}g out of one meal is a monster number my man.`;
  } else if (calories > 0 && protein / calories >= 0.09) {
    note = ' Protein to calorie ratio on that is exactly where we want it.';
  } else if (calories >= 700 && protein < 25) {
    note = ' Thats a lot of calories without much protein attached to it though.';
  } else if (fat >= 55) {
    note = ' Most of that is fat so keep the rest of the day leaner.';
  }

  return `${macros}${note} ${closerFor(id, meal)}`;
}
