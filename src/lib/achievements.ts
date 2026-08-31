/*
  The dopamine hit, made of numbers the app already holds.

  Deliberately no new tables. Every badge here is derived from things already
  written down — finished workouts, PR flags, weigh-ins, photos, step logs,
  goal completions — which means this shipped without a migration, and a
  client who has been training for months opens the screen already holding
  the ones they earned before it existed. A badge system that starts everyone
  at zero on launch day punishes exactly the people who have done the most.

  The catalogue is a plain list on purpose. Colby will want to change it once
  he sees it live, and changing it should mean editing one line here, not
  understanding a rules engine.
*/

export type AchievementStats = {
  /** Completed sessions, all time. */
  workouts: number;
  /** Longest run of consecutive active days. */
  bestStreak: number;
  /** Sets ever flagged as a personal best. */
  prs: number;
  /** How many DIFFERENT lifts they have PR'd on. */
  liftsWithPr: number;
  /** Pounds down from their first weigh-in. Negative when they have gained. */
  poundsDown: number;
  /** Progress photos uploaded. */
  photos: number;
  /** Longest run of consecutive days hitting the protein goal. */
  proteinStreak: number;
  /** Steps in the last 30 days. */
  stepsLast30: number;
};

export type Achievement = {
  id: string;
  title: string;
  /** What earns it, in the second person, short enough to sit under the title. */
  detail: string;
  /** True when earned. */
  earned: (s: AchievementStats) => boolean;
  /*
    How close they are, 0–1, for the ones that are a climb rather than a
    moment. Null for the ones you either have or don't — drawing a 40% bar
    under "First workout" is noise, because the only way to move it is to do
    the whole thing.
  */
  progress?: (s: AchievementStats) => number;
};

const ratio = (have: number, need: number) => Math.max(0, Math.min(1, have / need));

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: 'first-workout',
    title: 'On the board',
    detail: 'Finish your first workout',
    earned: (s) => s.workouts >= 1,
  },
  {
    id: 'streak-7',
    title: 'Seven straight',
    detail: 'Show up seven days in a row',
    earned: (s) => s.bestStreak >= 7,
    progress: (s) => ratio(s.bestStreak, 7),
  },
  {
    id: 'streak-14',
    title: 'Two weeks unbroken',
    detail: 'Show up fourteen days in a row',
    earned: (s) => s.bestStreak >= 14,
    progress: (s) => ratio(s.bestStreak, 14),
  },
  {
    id: 'streak-30',
    title: 'A full month',
    detail: 'Show up thirty days in a row',
    earned: (s) => s.bestStreak >= 30,
    progress: (s) => ratio(s.bestStreak, 30),
  },
  {
    id: 'first-pr',
    title: 'First PR',
    detail: 'Beat a weight you have lifted before',
    earned: (s) => s.prs >= 1,
  },
  {
    id: 'five-lifts-pr',
    title: 'Stronger everywhere',
    detail: 'Set a PR on five different lifts',
    earned: (s) => s.liftsWithPr >= 5,
    progress: (s) => ratio(s.liftsWithPr, 5),
  },
  {
    id: 'down-10',
    title: 'Ten pounds down',
    detail: 'Ten pounds below your first weigh-in',
    earned: (s) => s.poundsDown >= 10,
    progress: (s) => ratio(s.poundsDown, 10),
  },
  {
    id: 'down-20',
    title: 'Twenty pounds down',
    detail: 'Twenty pounds below your first weigh-in',
    earned: (s) => s.poundsDown >= 20,
    progress: (s) => ratio(s.poundsDown, 20),
  },
  {
    id: 'first-photo',
    title: 'Before shot',
    detail: 'Upload your first progress photo',
    earned: (s) => s.photos >= 1,
  },
  {
    id: 'protein-week',
    title: 'Protein, all week',
    detail: 'Hit your protein goal seven days running',
    earned: (s) => s.proteinStreak >= 7,
    progress: (s) => ratio(s.proteinStreak, 7),
  },
  {
    id: 'steps-100k',
    title: '100,000 steps',
    detail: 'Walk 100,000 steps in a month',
    earned: (s) => s.stepsLast30 >= 100000,
    progress: (s) => ratio(s.stepsLast30, 100000),
  },
];

export type AchievementState = {
  id: string;
  title: string;
  detail: string;
  earned: boolean;
  /** 0–1, or null when the badge is a moment rather than a climb. */
  progress: number | null;
};

/**
 * The whole board for one client: earned first, then the closest to being
 * earned, then the rest.
 *
 * Ordering by nearness matters more than it sounds. A locked list in
 * catalogue order buries the badge somebody is two days from under four they
 * cannot touch for months, and the one they can nearly reach is the only one
 * that changes what they do today.
 */
export function achievementsFor(stats: AchievementStats): AchievementState[] {
  const states = ACHIEVEMENTS.map((a) => {
    const earned = a.earned(stats);
    return {
      id: a.id,
      title: a.title,
      detail: a.detail,
      earned,
      // An earned badge has no bar; it is finished. And a badge that is a
      // moment rather than a climb never had one.
      progress: earned || !a.progress ? null : a.progress(stats),
    };
  });

  return states.sort((a, b) => {
    if (a.earned !== b.earned) return a.earned ? -1 : 1;
    if (a.earned) return 0;
    return (b.progress ?? 0) - (a.progress ?? 0);
  });
}

/** How many of the catalogue this client holds. */
export function earnedCount(states: AchievementState[]) {
  return states.filter((s) => s.earned).length;
}

/**
 * The longest unbroken run of days in a set of day-keys ("2026-08-31").
 *
 * Deliberately the LONGEST run and not the current one. streakFrom answers
 * "am I on a streak right now", which is the right question for the Today
 * screen and the wrong one here: a badge that vanishes the day somebody
 * misses is a punishment, and you cannot un-earn a thing you did. Once the
 * seven days happened, they happened.
 */
export function longestRun(dayKeys: Set<string>) {
  if (dayKeys.size === 0) return 0;

  const days = [...dayKeys].sort();
  const asUtc = (key: string) => Date.parse(key + 'T00:00:00Z');

  let best = 1;
  let run = 1;
  for (let i = 1; i < days.length; i++) {
    // Whole-day arithmetic on UTC midnights, so the twice-yearly 23- and
    // 25-hour local days cannot split a run that was never broken.
    const gap = (asUtc(days[i]) - asUtc(days[i - 1])) / 86400000;
    run = gap === 1 ? run + 1 : 1;
    if (run > best) best = run;
  }
  return best;
}
