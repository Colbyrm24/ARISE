/*
  The backgrounds a client can pick.

  Each one is a handful of HSL token overrides, not an image. That matters for
  three reasons: it costs nothing to load on a phone in a gym with two bars of
  signal, it cannot fight the text for contrast the way a photo does, and the
  whole app — every window edge, glow and accent — follows automatically
  because everything already reads from these tokens.

  The structure of the theme never changes. What changes is the hue of the
  ground and the hue of the light landing on it, which is what makes them feel
  like different rooms rather than different apps.
*/

export type BackgroundId =
  | 'beam'
  | 'ember'
  | 'tide'
  | 'violet'
  | 'slate'
  | 'gold'
  | 'rose'
  | 'sand'
  | 'midnight';

export const DEFAULT_BACKGROUND: BackgroundId = 'beam';

export const BACKGROUNDS: {
  id: BackgroundId;
  name: string;
  /** What it looks like, for the swatch in the picker. */
  swatch: { ground: string; accent: string };
}[] = [
  { id: 'beam', name: 'Beam', swatch: { ground: 'hsl(224 30% 4%)', accent: 'hsl(211 100% 72%)' } },
  { id: 'ember', name: 'Ember', swatch: { ground: 'hsl(14 34% 5%)', accent: 'hsl(18 100% 66%)' } },
  /*
    Teal, not green. Green is reserved for "complete" everywhere in this app,
    and an accent beside it would make a landed goal and an untouched one the
    same colour on the Today card.
  */
  { id: 'tide', name: 'Tide', swatch: { ground: 'hsl(196 40% 4%)', accent: 'hsl(186 84% 56%)' } },
  {
    id: 'violet',
    name: 'Violet',
    swatch: { ground: 'hsl(266 32% 5%)', accent: 'hsl(268 100% 78%)' },
  },
  { id: 'slate', name: 'Slate', swatch: { ground: 'hsl(220 8% 5%)', accent: 'hsl(210 12% 82%)' } },
  { id: 'gold', name: 'Gold', swatch: { ground: 'hsl(40 24% 4%)', accent: 'hsl(42 96% 62%)' } },
  { id: 'rose', name: 'Rose', swatch: { ground: 'hsl(340 22% 5%)', accent: 'hsl(342 92% 72%)' } },
  { id: 'sand', name: 'Sand', swatch: { ground: 'hsl(32 12% 5%)', accent: 'hsl(36 44% 78%)' } },
  {
    id: 'midnight',
    name: 'Midnight',
    swatch: { ground: 'hsl(244 34% 4%)', accent: 'hsl(250 96% 78%)' },
  },
];

const IDS = new Set(BACKGROUNDS.map((b) => b.id));

/**
 * The stored value, or the default.
 *
 * Anything unrecognised falls back rather than being rendered as a data
 * attribute nothing styles — a stale theme name left over from a rename
 * would otherwise produce a page with no background rules at all.
 */
export function backgroundOf(raw: string | null | undefined): BackgroundId {
  return raw && IDS.has(raw as BackgroundId) ? (raw as BackgroundId) : DEFAULT_BACKGROUND;
}
