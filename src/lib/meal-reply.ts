import type { DayContext } from '@/lib/day-shape';

/*
  The line the coach actually sends back.

  Confirming a photo already updates the client's day, but that was never the
  part that took the time. The time goes into opening Messages, finding the
  thread, and typing the same shape of sentence forty times a day. So the
  queue writes it, in his voice, and he sends or edits it without leaving the
  screen.

  Four rules, taken from how he actually texts. The first three came from him
  correcting drafts; the fourth came from measuring 4,809 of his sent messages:

  - The number comes first. No "that comes out to about" — the figure is the
    first thing on the line.
  - Exactly one question at the end, and it looks forward rather than back at
    the plate.
  - Never narrate the photo back at them. "Grilled chicken and rice, nice
    choice" is the single clearest tell that a coach didn't write it.
  - LENGTH. His median sent message is 58 characters; his median message
    containing a calorie figure is 211. Only 3.6% of what he sends runs past
    400. A reply that reads perfectly but runs 600 characters is wrong — it
    is the tell he actually flagged, ahead of any wording.

  Which means the body is: macros, ONE observation, short question. Not three
  stacked observations. Anything else that needs saying is its own message.
*/

/** Closers, rotated so forty meals in a day don't all end the same way. */
const CLOSERS = [
  'Whats the rest of today lookin like food wise?',
  'How we doing on the rest of the day?',
  'Energy feelin good today?',
  'What else has gone in so far?',
  'Hows the body feeling today?',
  'Whats the plan for dinner?',
];

/**
 * Closers for a day that is essentially finished.
 *
 * Asking "what else is going in today" at the end of somebody's day reads as
 * not having looked, which is exactly the impression the queue exists to
 * avoid. When the numbers say they're done, the question has to look at
 * tomorrow or at how they feel instead.
 */
const CLOSERS_DONE = [
  'Hows the body feeling today?',
  'Whats tomorrow lookin like?',
  'Energy feelin good today?',
  'How was training today?',
];

/**
 * Picked off the row id rather than at random.
 *
 * This text lands in an editable box. If the closer changed every time the
 * page re-rendered, a coach halfway through editing would watch the sentence
 * rewrite itself under the cursor.
 */
function closerFor(id: string, meal: string | null, done: boolean) {
  const pool = done ? CLOSERS_DONE : meal === 'dinner' ? CLOSERS.slice(0, 5) : CLOSERS;
  let n = 0;
  for (let i = 0; i < id.length; i += 1) n = (n * 31 + id.charCodeAt(i)) % 100003;
  return pool[n % pool.length];
}

/** Whole numbers. Nobody texts a client "47.3g protein". */
function r(n: number) {
  return Math.round(n);
}

/**
 * Thousands separator on calorie figures.
 *
 * He writes "1,450 cals" and "around 1,580" — the comma is in his real
 * messages, and a bare "1580" is one of the small things that makes a
 * generated line look generated.
 */
function c(n: number) {
  return r(n).toLocaleString('en-US');
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
  /** Totals for the whole day including this meal. Absent on older callers. */
  day?: DayContext | null;
};

/**
 * The one observation, chosen from the day rather than the plate.
 *
 * A note about the plate alone can only ever repeat what the numbers above it
 * already said. A note about the day tells the client something they could
 * not read off their own photo, which is the entire value of having a coach
 * look at it.
 *
 * Falls back to plate-level observations when there is no target to judge
 * against — a client the coach hasn't set numbers for yet still deserves a
 * reply that isn't purely arithmetic.
 */
function observationFor(input: ReplyInput): string {
  const { day, protein, calories, fat } = input;

  if (day?.target && day.left) {
    switch (day.flag) {
      case 'under':
        // The one that matters most. Says the number, then what to do.
        return ` Youre only at ${c(day.calories)} for the whole day though so theres plenty of room left, get another real meal in.`;
      case 'over':
        return ` That puts you ${c(Math.abs(day.left.calories))} over for the day so lets keep tomorrow tight.`;
      case 'fat_spent':
        return ` Fats already at ${r(day.fat)}g for the day so keep whatever else goes in lean.`;
      case 'protein_behind':
        return ` Youre at ${r(day.protein)}g protein for the day which is behind where the calories are, so make the next one protein heavy.`;
      case 'easy_close':
        return ` ${c(day.left.calories)} left and only ${r(day.left.protein)}g protein to go, thats an easy close.`;
      default:
        return ` Puts you around ${c(day.calories)} for the day with ${r(day.protein)}g protein.`;
    }
  }

  // No target set. Judge the plate, as before.
  if (protein >= 60) return ` ${r(protein)}g out of one meal is a monster number my man.`;
  if (calories > 0 && protein / calories >= 0.09)
    return ' Protein to calorie ratio on that is exactly where we want it.';
  if (calories >= 700 && protein < 25)
    return ' Thats a lot of calories without much protein attached to it though.';
  if (fat >= 55) return ' Most of that is fat so keep the rest of the day leaner.';
  return '';
}

export function macroReply(input: ReplyInput) {
  const { id, meal, calories, protein, carbs, fat, failed, day } = input;

  // A finished day changes which question makes sense at the end.
  const done = Boolean(
    day?.target && day.left && day.left.calories <= day.target.calories * 0.12
  );

  if (failed) {
    // No numbers to give. Asking for the detail is the honest move — inventing
    // a figure here is how a client ends up eating to a number nobody read.
    return `Couldnt get a clear read on that one my man. Roughly how much was on the plate and Ill get you the numbers. ${closerFor(id, meal, false)}`;
  }

  const macros = `About ${c(calories)} calories ${r(protein)}g protein ${r(carbs)}g carbs ${r(fat)}g fat.`;

  return `${macros}${observationFor(input)} ${closerFor(id, meal, done)}`;
}

/**
 * "Was that everything?" — asked only when it's a real question.
 *
 * He sends this constantly ("were those two meals all you had my guy??") and
 * it is one of the few lines that has to be a separate message rather than
 * folded into the reply, because the reply already spent its one question.
 * Returned separately so the card can offer it rather than the generator
 * smuggling a second question into the text.
 */
export function askIfThatsAll(day: DayContext | null | undefined): string | null {
  if (!day || !day.target) return null;
  if (day.meals === 0 || day.meals > 2) return null;
  if (day.calories >= day.target.calories * 0.6) return null;
  return day.meals === 1
    ? 'Was that the only thing today my guy??'
    : 'Were those two meals all you had my guy??';
}
