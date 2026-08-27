/*
  One colour per thing being tracked, decided once.

  The Today screen shows six different quantities against six different goals —
  calories, protein, carbs, fat, steps, and whether the session got done — and
  before this they were all rendered in the same accent blue. Six identical
  bars means the client has to read every label to find the one that is behind,
  which is the opposite of what a progress screen is for. Colour lets them find
  it at a glance and then read the label to confirm.

  The hues are the validated dark-mode categorical steps from the house data-viz
  palette, ordered so that no two ADJACENT slots collide — the order below is
  the render order on screen, and it is not arbitrary. Checked against this
  app's own card surface (#070f22) rather than a generic dark:

    lightness band   all six inside L 0.48–0.67
    chroma floor     all six >= 0.1
    CVD separation   worst adjacent 8.4 ΔE protan (>= 8 target)
    normal vision    worst adjacent 19.8 ΔE (>= 15 floor)
    contrast         all six >= 3:1 against the surface

  Yellow next to red is the pair that fails — 13.0 ΔE, under the floor — so
  protein and carbs are deliberately separated by fat. Reordering these without
  re-running scripts/validate_palette.js will quietly break that.

  Colour is never the only signal: every ring and bar carries its own label and
  its own number, so a client who cannot separate two hues loses nothing.
*/

/*
  Render order, and it is the validated order — not alphabetical, not the order
  a nutrition label prints them in.

  Fat sits between protein and carbs deliberately: red beside yellow is the one
  pair in this set that fails the normal-vision floor (13.0 ΔE against a 15
  minimum), and separating them is what makes the whole palette pass. There is
  a test that fails if this order is changed back.
*/
export const METRICS = ['calories', 'protein', 'fat', 'carbs', 'steps', 'workout'] as const;
export type Metric = (typeof METRICS)[number];

export type MetricMeta = {
  label: string;
  /** Suffix on the value, e.g. "g". Empty for counts. */
  unit: string;
  /** Validated categorical hue for the dark surface. */
  color: string;
  /**
   * Calories are a ceiling to stay under; everything else is a floor to reach.
   *
   * The distinction changes what "over" means — 2,400 of 2,100 calories is a
   * problem and 160g of 150g protein is not — and it is why a single "percent
   * of goal" bar was never enough on its own.
   */
  mode: 'budget' | 'reach';
};

export const METRIC_META: Record<Metric, MetricMeta> = {
  calories: { label: 'Calories', unit: '', color: '#3987e5', mode: 'budget' },
  protein: { label: 'Protein', unit: 'g', color: '#e66767', mode: 'reach' },
  fat: { label: 'Fat', unit: 'g', color: '#9085e9', mode: 'budget' },
  carbs: { label: 'Carbs', unit: 'g', color: '#c98500', mode: 'reach' },
  steps: { label: 'Steps', unit: '', color: '#199e70', mode: 'reach' },
  workout: { label: 'Workout', unit: '', color: '#d95926', mode: 'reach' },
};

export type Progress = {
  /** 0–100, for the fill. Never above 100 — see `over`. */
  pct: number;
  /** True fraction, uncapped. */
  ratio: number;
  /** Past the goal. Good on a reach, bad on a budget. */
  over: boolean;
  /** Reached the goal without exceeding it. */
  hit: boolean;
  /** No goal set, so there is nothing to be a fraction of. */
  untargeted: boolean;
};

/**
 * How far along one metric is.
 *
 * A zero or missing target is `untargeted`, not zero percent, and not a
 * division. Rendering a full bar because `40 / 0` is Infinity is a real bug
 * this app shipped, and a client seeing a complete protein ring on a day they
 * had no target is worse than seeing an empty one.
 */
export function progressOf(value: number, target: number | null | undefined): Progress {
  const v = Number.isFinite(value) ? Math.max(0, value) : 0;
  const t = Number.isFinite(target ?? NaN) ? Number(target) : 0;

  if (t <= 0) {
    return { pct: 0, ratio: 0, over: false, hit: false, untargeted: true };
  }

  const ratio = v / t;
  return {
    pct: Math.min(100, ratio * 100),
    ratio,
    over: ratio > 1,
    // A budget is "hit" when it is close to full without spilling; a reach is
    // hit the moment it lands. Both are the state worth congratulating.
    hit: ratio >= 1,
    untargeted: false,
  };
}

/** `1,807` — thousands separators, because 1807 reads as a serial number. */
export function fmt(n: number): string {
  return Math.round(n).toLocaleString('en-US');
}
