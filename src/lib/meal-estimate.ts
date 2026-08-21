import { anthropic, AI_MODEL } from '@/lib/ai';

/*
  Reading macros off a photograph of a plate.

  This is the single job the coach does most: a client photographs their food,
  the coach names the items, assumes a portion for each, and calls the numbers.
  Doing it here doesn't replace him — a read that nobody checks is worth very
  little, and the client can tell the difference. It moves him from computing
  to correcting, which is a much shorter task and one he can do fifteen at a
  time instead of one text thread at a time.

  Three things this file is careful about, in order of how much they matter:

  1. A failed read must never cost the client their photo or their log. The
     row saves either way. That's why nothing in here throws.
  2. The numbers have to be committed to. Ranges ("400-600 calories") are
     useless to somebody trying to hit a target, and they're not what the
     coach sends. One number per macro.
  3. The read has to say what it assumed. "8oz sirloin" is correctable in
     four seconds; "steak, 620 calories" is not, because the coach has no idea
     which half of it to argue with.
*/

export type EstimateItem = {
  name: string;
  /** The portion the read assumed, in the words a person would use. */
  portion: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type MealEstimate = {
  /** A short name for the whole plate, e.g. "Grilled chicken with rice". */
  name: string;
  items: EstimateItem[];
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  confidence: 'high' | 'medium' | 'low';
  /** What was hard to tell — the thing the coach should check first. */
  note: string | null;
  /** Set when the totals had to be reconciled against the macros. */
  adjusted?: boolean;
};

export type EstimateResult =
  | { ok: true; estimate: MealEstimate }
  | { ok: false; reason: 'not-food' | 'unreadable' | 'unavailable'; message: string };

/** Photos go to the model at this longest edge; see downscale() in the action. */
export const ESTIMATE_MAX_EDGE = 1024;

const TOOL_NAME = 'record_meal';

const SYSTEM = `You read photographs of food for a 1-on-1 fitness coach and return the macronutrients.

The coach's clients are hitting daily calorie and protein targets, so your numbers get used, not admired. Follow these rules exactly.

COMMIT TO A NUMBER. One figure per macro, never a range and never a hedge. If a portion is ambiguous, pick the most likely one and say which one you picked in the note. "About 600-800 calories" is a non-answer; "710 calories, assuming an 8oz sirloin" is an answer someone can correct.

SAY WHAT YOU ASSUMED. Every item carries the portion you assumed for it. The coach corrects portions, not totals — they can only do that if they can see what you used.

READ WHAT IS ACTUALLY THERE. Judge portions against the plate, the utensils, the container, and the client's hands if visible. A restaurant portion is bigger than a home one. Cooked chicken is roughly 75 percent of its raw weight. Do not average toward a "typical" serving when the photo shows something larger or smaller.

COUNT WHAT HIDES. Cooking oil, butter, dressing, sauce, cheese and mayonnaise are where the calories go missing, and they are the most common reason a read comes in low. If a food is fried, sauteed, dressed or glazed, include the fat it was cooked or dressed in.

CONFIDENCE IS ABOUT THE PORTION, NOT THE FOOD. Use high when the items are clear and the portion is bounded by something you can see. Use medium when you know the food but are guessing at the amount. Use low when part of the plate is hidden, out of frame, or you cannot tell what a component is.

If the photograph is not food, or is too dark or blurred to read, say so instead of guessing — an invented number is worse for this client than no number.`;

const TOOL = {
  name: TOOL_NAME,
  description: 'Record the macronutrients read from a photograph of a meal.',
  input_schema: {
    type: 'object' as const,
    properties: {
      readable: {
        type: 'boolean',
        description: 'False if this is not food, or is too dark or blurred to read.',
      },
      problem: {
        type: 'string',
        description: 'When readable is false, one short sentence on why.',
      },
      name: { type: 'string', description: 'Short name for the whole plate.' },
      items: {
        type: 'array',
        description: 'Every distinct component on the plate.',
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            portion: {
              type: 'string',
              description: 'The portion assumed, e.g. "6 oz cooked" or "1 cup".',
            },
            calories: { type: 'number' },
            protein: { type: 'number', description: 'Grams.' },
            carbs: { type: 'number', description: 'Grams.' },
            fat: { type: 'number', description: 'Grams.' },
          },
          required: ['name', 'portion', 'calories', 'protein', 'carbs', 'fat'],
        },
      },
      confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
      note: {
        type: 'string',
        description:
          'The one thing the coach should check first. Leave empty if the plate is unambiguous.',
      },
    },
    required: ['readable'],
  },
};

type ToolInput = {
  readable?: boolean;
  problem?: string;
  name?: string;
  items?: Partial<EstimateItem>[];
  confidence?: string;
  note?: string;
};

function clean(n: unknown, max: number): number {
  const v = Number(n);
  if (!Number.isFinite(v) || v < 0) return 0;
  return Math.min(Math.round(v), max);
}

/*
  Drinks whose calories legitimately exceed their macros.

  Ethanol carries 7 kcal/g and is counted in no macro column, so a beer really
  does read as 150 calories against 60 calories of protein, carbs and fat. It
  is not a mistake and must not be reconciled away — doing so would log a
  client a third of the drink they actually had, every time, and undercounting
  is the failure that costs someone their deficit.
*/
const ALCOHOL = /\b(beer|lager|ale|ipa|stout|pilsner|cider|wine|prosecco|champagne|sake|vodka|gin|rum|whisk(?:e)?y|bourbon|scotch|tequila|mezcal|brandy|cognac|liqueur|schnapps|aperol|campari|spritz|margarita|mojito|martini|negroni|daiquiri|cosmopolitan|old fashioned|seltzer|white claw|truly|shot|cocktail|hard )/i;

/**
 * Totals from the items, then reconciled against the 4/4/9 arithmetic.
 *
 * Macros and calories are two statements about the same food, and a model can
 * return a pair that disagree. When they do, the macros are the ones to keep:
 * they're the part the coach reasons about, they're what the client's protein
 * target is set in, and a calorie figure is trivially recoverable from them
 * while the reverse is not.
 *
 * Alcohol is carried at its stated calories and excluded from the comparison,
 * so one drink on the plate can't drag the whole meal's check off.
 */
function reconcile(items: EstimateItem[]) {
  const protein = items.reduce((s, i) => s + i.protein, 0);
  const carbs = items.reduce((s, i) => s + i.carbs, 0);
  const fat = items.reduce((s, i) => s + i.fat, 0);

  const drinks = items.filter((i) => ALCOHOL.test(i.name));
  const food = items.filter((i) => !ALCOHOL.test(i.name));

  const drinkCalories = drinks.reduce((s, i) => s + i.calories, 0);
  const stated = food.reduce((s, i) => s + i.calories, 0);
  const fromMacros = food.reduce((s, i) => s + i.protein * 4 + i.carbs * 4 + i.fat * 9, 0);

  // Below roughly 400 calories a percentage tolerance is uselessly tight, so
  // allow a flat 60 as well — rounding across several items moves a small
  // plate by that much on its own.
  const slack = Math.max(60, fromMacros * 0.15);
  const adjusted = Math.abs(stated - fromMacros) > slack;

  return {
    protein: Math.round(protein),
    carbs: Math.round(carbs),
    fat: Math.round(fat),
    calories: Math.round((adjusted ? fromMacros : stated) + drinkCalories),
    adjusted,
  };
}

function buildPrompt(description: string | null) {
  const lines = [
    'Read this meal and record the macros.',
    description?.trim()
      ? `The client says this is: ${description.trim()}. Trust that for what the food IS; still judge the portion from the photograph.`
      : 'The client sent no description, so identify everything from the photograph alone.',
  ];
  return lines.join('\n\n');
}

/**
 * Reads one photo.
 *
 * Never throws. Every failure comes back as a reason the caller can put in
 * front of a person, because the caller is a server action that has already
 * accepted the client's photo and must still save their log.
 */
export async function estimateMealFromPhoto(input: {
  base64: string;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
  description?: string | null;
}): Promise<EstimateResult> {
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, reason: 'unavailable', message: 'Photo reading is not switched on yet.' };
  }

  let raw: ToolInput;
  try {
    const response = await anthropic.messages.create({
      model: AI_MODEL,
      max_tokens: 1200,
      system: SYSTEM,
      // Forcing the tool is what makes this a data call rather than a chat.
      // Without it the model sometimes answers in prose, and prose has to be
      // parsed, and a parser is one more thing that can fail at 6am.
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL_NAME },
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: input.mediaType, data: input.base64 },
            },
            { type: 'text', text: buildPrompt(input.description ?? null) },
          ],
        },
      ],
    });

    const block = response.content.find((b) => b.type === 'tool_use');
    if (!block || block.type !== 'tool_use') {
      return { ok: false, reason: 'unreadable', message: "Couldn't read that photo." };
    }
    raw = block.input as ToolInput;
  } catch (error) {
    console.error('meal estimate failed:', error);
    return {
      ok: false,
      reason: 'unavailable',
      message: "Couldn't read that photo just now — your log saved without numbers.",
    };
  }

  if (raw.readable === false) {
    return {
      ok: false,
      reason: 'not-food',
      message: raw.problem?.trim() || "That doesn't look like food.",
    };
  }

  const items: EstimateItem[] = (raw.items ?? [])
    .filter((i) => i && typeof i.name === 'string' && i.name.trim())
    .map((i) => ({
      name: String(i.name).trim().slice(0, 80),
      portion: String(i.portion ?? '').trim().slice(0, 60),
      calories: clean(i.calories, 5000),
      protein: clean(i.protein, 400),
      carbs: clean(i.carbs, 800),
      fat: clean(i.fat, 400),
    }))
    .slice(0, 20);

  // A readable photo with nothing on it is a failed read, not an empty meal.
  if (items.length === 0) {
    return { ok: false, reason: 'unreadable', message: "Couldn't make out the food in that one." };
  }

  const totals = reconcile(items);
  const confidence =
    raw.confidence === 'high' || raw.confidence === 'low' ? raw.confidence : 'medium';

  return {
    ok: true,
    estimate: {
      name: (raw.name ?? '').trim().slice(0, 120) || items.map((i) => i.name).join(', ').slice(0, 120),
      items,
      calories: totals.calories,
      protein: totals.protein,
      carbs: totals.carbs,
      fat: totals.fat,
      // A read that had to be reconciled disagreed with itself, and the coach
      // should know that before trusting the confidence it claimed.
      confidence: totals.adjusted && confidence === 'high' ? 'medium' : confidence,
      note: (raw.note ?? '').trim().slice(0, 300) || null,
      adjusted: totals.adjusted || undefined,
    },
  };
}
