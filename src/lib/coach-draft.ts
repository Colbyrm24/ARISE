import { anthropic, AI_MODEL, aiConfigured } from '@/lib/ai';
import type { DayContext } from '@/lib/day-shape';

/*
  A reply the coach can send, drafted for him.

  The meal queue already writes the food replies, because a macro answer has a
  fixed shape and can be assembled from numbers with no model in the loop. The
  rest of a thread does not: "cant make the gym tonight", "is creatine worth
  it", "my knee is acting up again". Those still get typed by hand, forty
  times a day, and they are what actually eats the evening.

  So this drafts one. It never sends. The text lands in the composer where he
  reads it, changes what he wants, and presses Send — the client only ever
  receives something a person chose to send. That is deliberate and is the
  whole reason there is no assistant on the client side of ARISE: a client
  cannot tell a model from their coach, and the product is that a real person
  is reading their food and their lifts.
*/

/** One side of the conversation, flattened for the prompt. */
export type DraftTurn = { from: 'client' | 'coach'; body: string };

export type DraftContext = {
  /** First name only — it is what he types. */
  clientFirstName: string;
  /** Their coaching status, so a lead does not get talked to like a client. */
  status: string | null;
  /** Oldest first. The tail of the thread is what the reply answers. */
  thread: DraftTurn[];
  /** Today's food, when there is any. Null when nothing was logged. */
  day: DayContext | null;
};

export type DraftResult = { text: string | null; error: string | null };

/**
 * The ceiling, in characters.
 *
 * His median sent message is 58 characters; his median message containing a
 * calorie figure is 211, and only 3.6% of what he sends runs past 400. A
 * draft that reads perfectly but runs 600 characters is wrong — length is the
 * tell he has flagged more often than any wording.
 */
export const MAX_DRAFT = 320;

/** How much of the thread the model gets. Enough for the thread of thought. */
export const THREAD_TURNS = 14;

const VOICE = `You are drafting one text message for Colby, an online fitness coach, to send to a client from his own phone. Write it exactly as he would write it. Output ONLY the message — no preamble, no quotes, no options, no explanation.

How he texts:
- Short. One continuous block, never blank lines between paragraphs.
- Sentence starts ARE capitalised, but apostrophes get dropped: thats, dont, youre, ive.
- Barely any commas. He writes short fragments where most people write clauses.
- One address term near the end, never stacked: my man / brotha / bro / dude.
- "Perfecttt" (stretched) opens a reply to good news. Emphasis by stretching the one word that carries it: hugeeee, lowww.
- "!!" is normal for him. One emoji at most, often none.
- Exactly ONE question, at the end, looking forward.

What he never does, and what gives a fake message away instantly:
- Narrating their message back at them. Never open by summarising or admiring what they just said ("thats awesome you hit that PR, must feel great"). React, or answer, and move it forward.
- Stacking three coaching points. One point. Anything else is its own message later.
- Hedging: "depending on how it's made", "roughly speaking", "that comes out to about". If a number is being given, the number comes first with no lead-in.
- Sounding like support staff. He is their coach and he is direct with them.`;

/** The day's food, as a line the model can use or ignore. */
export function describeDay(day: DayContext | null): string | null {
  if (!day || day.meals === 0) return null;

  const round = (n: number) => Math.round(n);
  const base = `Today so far: ${round(day.calories).toLocaleString('en-US')} calories, ${round(day.protein)}g protein, ${round(day.carbs)}g carbs, ${round(day.fat)}g fat across ${day.meals} logged ${day.meals === 1 ? 'item' : 'items'}.`;

  if (!day.target || !day.left) return base;

  const t = day.target;
  return `${base} Their target is ${t.calories.toLocaleString('en-US')} calories and ${round(t.protein)}g protein, leaving ${round(day.left.calories).toLocaleString('en-US')} calories and ${round(day.left.protein)}g protein.`;
}

/**
 * The whole user turn. Pure, so the shape of what the model is asked can be
 * tested without spending a token.
 */
export function buildPrompt(ctx: DraftContext): string {
  const parts: string[] = [];

  parts.push(`Client: ${ctx.clientFirstName}${ctx.status ? ` (status: ${ctx.status})` : ''}`);

  const day = describeDay(ctx.day);
  if (day) parts.push(day);

  const turns = ctx.thread.slice(-THREAD_TURNS);
  if (turns.length === 0) {
    parts.push('There is no conversation yet. Open one.');
  } else {
    parts.push(
      'The conversation, oldest first:\n' +
        turns.map((t) => `${t.from === 'coach' ? 'Colby' : ctx.clientFirstName}: ${t.body}`).join('\n')
    );
    parts.push('Write Colbys next message.');
  }

  return parts.join('\n\n');
}

/** Splits on sentence ends, keeping the punctuation on the sentence. */
function sentencesOf(text: string): string[] {
  return text.match(/[^.!?]+[.!?]*\s*/g)?.map((s) => s.trim()).filter(Boolean) ?? [text];
}

/**
 * Makes a model's answer look like something he typed.
 *
 * Blank-line gaps and wrapping quotes are the two things that survive even a
 * good prompt, and both read wrong in a message bubble. Length is handled by
 * dropping sentences out of the MIDDLE rather than cutting the end off: his
 * messages end on a question, and a draft truncated mid-word is worse than a
 * long one because it looks broken rather than wordy.
 */
export function tidyDraft(raw: string): string {
  let text = raw.trim();

  // Models like to announce themselves, and to quote the thing they wrote.
  text = text.replace(/^(here'?s?( is)?[^:\n]{0,40}:|draft:|message:)\s*/i, '').trim();
  if (text.length > 1 && /^["'“”']/.test(text) && /["'“”']$/.test(text)) {
    text = text.slice(1, -1).trim();
  }

  // One block. A paragraph gap in an iMessage bubble is a tell on its own.
  text = text.replace(/\s*\n+\s*/g, ' ').replace(/[ \t]{2,}/g, ' ').trim();

  if (text.length <= MAX_DRAFT) return text;

  const sentences = sentencesOf(text);
  if (sentences.length < 2) return text;

  // The last sentence is the question he closes on, so it is never the one
  // that gets dropped.
  const last = sentences[sentences.length - 1];
  const kept: string[] = [];
  let used = last.length;

  for (const sentence of sentences.slice(0, -1)) {
    if (used + sentence.length + 1 > MAX_DRAFT) break;
    kept.push(sentence);
    used += sentence.length + 1;
  }

  return [...kept, last].join(' ');
}

/**
 * Asks the model for the reply. Returns a message rather than throwing: this
 * runs behind a button on a screen the coach is standing on, and a bad minute
 * at Anthropic should grey out one button, not take down his inbox.
 */
export async function draftCoachReply(ctx: DraftContext): Promise<DraftResult> {
  if (!aiConfigured()) {
    return { text: null, error: 'No Anthropic key is set on this deployment yet.' };
  }

  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 400,
      system: VOICE,
      messages: [{ role: 'user', content: buildPrompt(ctx) }],
    });

    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();

    if (!text) return { text: null, error: 'Nothing came back — try again.' };
    return { text: tidyDraft(text), error: null };
  } catch (err) {
    console.error('Could not draft a coach reply', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { text: null, error: 'That did not come back — try again.' };
  }
}
