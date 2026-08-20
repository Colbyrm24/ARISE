export type OnboardingField = {
  key: string;
  label: string;
  type: 'text' | 'long' | 'select' | 'number';
  options?: string[];
  hint?: string;
  required?: boolean;
};

export type OnboardingStep = {
  key: string;
  title: string;
  blurb: string;
  fields: OnboardingField[];
};

/**
 * Client intake. Split into steps that each save on their own so nobody has to
 * finish the whole thing in one sitting — and so a half-finished intake still
 * tells the coach something useful.
 *
 * Deliberately no health-history section: this is a coaching intake, not a
 * medical form, and injuries are asked about only as "what should I program
 * around", which is the part a coach can actually act on.
 */
export const ONBOARDING_STEPS: OnboardingStep[] = [
  {
    key: 'goals',
    title: 'Your goal',
    blurb: 'What we are actually building toward.',
    fields: [
      {
        key: 'primaryGoal',
        label: 'Primary goal',
        type: 'select',
        options: ['Lose fat', 'Build muscle', 'Recomp — lose fat and build muscle', 'Get stronger', 'General health'],
        required: true,
      },
      { key: 'currentWeight', label: 'Current weight (lb)', type: 'number' },
      { key: 'goalWeight', label: 'Goal weight (lb)', type: 'number' },
      {
        key: 'why',
        label: 'Why now?',
        type: 'long',
        hint: 'The real reason. This is the thing I will remind you of in week six.',
      },
    ],
  },
  {
    key: 'training',
    title: 'Training',
    blurb: 'So your program matches what you can actually do.',
    fields: [
      {
        key: 'experience',
        label: 'Training experience',
        type: 'select',
        options: ['Brand new', 'Under a year', '1–3 years', '3+ years'],
        required: true,
      },
      {
        key: 'daysPerWeek',
        label: 'Days per week you can train',
        type: 'select',
        options: ['2', '3', '4', '5', '6'],
        required: true,
      },
      {
        key: 'access',
        label: 'Where are you training?',
        type: 'select',
        options: ['Commercial gym', 'Home gym', 'Garage / minimal equipment', 'Bodyweight only'],
        required: true,
      },
      {
        key: 'equipment',
        label: 'Anything missing at your gym?',
        type: 'long',
        hint: 'Machines you do not have, that kind of thing.',
      },
      {
        key: 'limitations',
        label: 'Anything I should program around?',
        type: 'long',
        hint: 'Old injuries, joints that flare up, movements that hurt. No detail needed — just what to avoid.',
      },
    ],
  },
  {
    key: 'nutrition',
    title: 'Food',
    blurb: 'The fastest way to a plan you will actually follow.',
    fields: [
      {
        key: 'mealsPerDay',
        label: 'Meals per day you prefer',
        type: 'select',
        options: ['1–2', '3', '4', '5+'],
      },
      {
        key: 'cooking',
        label: 'How much do you cook?',
        type: 'select',
        options: ['I cook most meals', 'I meal prep once a week', 'Mostly eating out', 'Barely cook at all'],
      },
      {
        key: 'loves',
        label: 'Foods you actually like',
        type: 'long',
        hint: 'Be specific. I build your plan around these.',
        required: true,
      },
      { key: 'hates', label: 'Foods you will not eat', type: 'long' },
      {
        key: 'restrictions',
        label: 'Allergies or dietary restrictions',
        type: 'text',
        hint: 'Anything I need to keep out of your plan entirely.',
      },
    ],
  },
  {
    key: 'lifestyle',
    title: 'Your week',
    blurb: 'Real life is what makes or breaks the plan.',
    fields: [
      {
        key: 'schedule',
        label: 'What does a normal week look like?',
        type: 'long',
        hint: 'Work hours, shifts, travel, kids — whatever shapes your days.',
      },
      {
        key: 'sleep',
        label: 'Hours of sleep on a normal night',
        type: 'select',
        options: ['Under 5', '5–6', '6–7', '7–8', '8+'],
      },
      {
        key: 'steps',
        label: 'Rough daily step count right now',
        type: 'select',
        options: ['Under 3,000', '3,000–6,000', '6,000–10,000', '10,000+', 'No idea'],
      },
      {
        key: 'biggestObstacle',
        label: 'What has gotten in the way before?',
        type: 'long',
        hint: 'What made it stop working last time you tried.',
      },
    ],
  },
];

export function readAnswer(json: unknown): Record<string, string> {
  if (!json || typeof json !== 'object' || Array.isArray(json)) return {};
  return json as Record<string, string>;
}
