import { prisma } from '@/lib/prisma';

/*
  Colby's program, as it actually runs.

  This is the split his clients are on today, transcribed movement for
  movement: the four sessions, the rest each exercise gets, and his own
  written notes at the top of every workout. Seeding it means a new client
  can be put on the real program in one action instead of being rebuilt by
  hand each time.

  Everything here is idempotent — running it twice changes nothing. It is
  safe to wire to a button a coach might double-click.

  The one thing this file cannot fill in is the demonstration videos. Those
  live in another platform's library and are not ours to copy, so every
  movement is created with an empty videoUrl and the exercise screen shows
  which ones are still missing one. Paste a link — YouTube, Vimeo, a file in
  storage — and it appears for every client on every workout that uses it.
*/

/** Rest, in seconds, written the way it reads on the workout card. */
const REST_90 = 90;
const REST_2M = 120;

type SeedExercise = {
  name: string;
  musclePrimary: string;
  muscleSecondary: string[];
  equipment: string;
  movementPattern: string;
};

/*
  Every movement the four sessions call for. Names match what the client
  hears in the gym — "Hack Squat", not "Machine Hack Squat (Plate Loaded)".
*/
export const EXERCISES: SeedExercise[] = [
  { name: 'Smith Machine Incline Bench Press', musclePrimary: 'Chest', muscleSecondary: ['Front delts', 'Triceps'], equipment: 'Smith machine', movementPattern: 'Horizontal press' },
  { name: 'Machine Seated Shoulder Press', musclePrimary: 'Shoulders', muscleSecondary: ['Triceps'], equipment: 'Machine', movementPattern: 'Vertical press' },
  { name: 'Machine Lateral Raise', musclePrimary: 'Side delts', muscleSecondary: [], equipment: 'Machine', movementPattern: 'Isolation' },
  { name: 'Machine Seated Reverse Fly', musclePrimary: 'Rear delts', muscleSecondary: ['Upper back'], equipment: 'Machine', movementPattern: 'Isolation' },
  { name: 'Lat Pull Down', musclePrimary: 'Lats', muscleSecondary: ['Biceps'], equipment: 'Machine', movementPattern: 'Vertical pull' },
  { name: 'Lying T-Bar Row', musclePrimary: 'Mid back', muscleSecondary: ['Lats', 'Biceps'], equipment: 'Machine', movementPattern: 'Horizontal pull' },
  { name: 'Cable Incline Chest Fly', musclePrimary: 'Chest', muscleSecondary: ['Front delts'], equipment: 'Cable', movementPattern: 'Isolation' },
  { name: 'Cable Straight Bar Tricep Pushdown', musclePrimary: 'Triceps', muscleSecondary: [], equipment: 'Cable', movementPattern: 'Isolation' },
  { name: 'Cable V-Bar Overhead Tricep Extension', musclePrimary: 'Triceps', muscleSecondary: [], equipment: 'Cable', movementPattern: 'Isolation' },
  { name: 'Machine Bicep Curl', musclePrimary: 'Biceps', muscleSecondary: [], equipment: 'Machine', movementPattern: 'Isolation' },
  { name: 'Dumbbell Hammer Preacher Curl', musclePrimary: 'Biceps', muscleSecondary: ['Forearms'], equipment: 'Dumbbell', movementPattern: 'Isolation' },
  { name: 'Hanging Leg Raise', musclePrimary: 'Abs', muscleSecondary: ['Hip flexors'], equipment: 'Pull up bar', movementPattern: 'Core' },
  { name: 'Hack Squat', musclePrimary: 'Quads', muscleSecondary: ['Glutes'], equipment: 'Machine', movementPattern: 'Squat' },
  { name: 'Machine Seated Leg Extension', musclePrimary: 'Quads', muscleSecondary: [], equipment: 'Machine', movementPattern: 'Isolation' },
  { name: 'Barbell Romanian Deadlift', musclePrimary: 'Hamstrings', muscleSecondary: ['Glutes', 'Lower back'], equipment: 'Barbell', movementPattern: 'Hinge' },
  { name: 'Machine Lying Leg Curl', musclePrimary: 'Hamstrings', muscleSecondary: [], equipment: 'Machine', movementPattern: 'Isolation' },
  { name: 'Machine Standing Calf Raise', musclePrimary: 'Calves', muscleSecondary: [], equipment: 'Machine', movementPattern: 'Isolation' },
  { name: 'Hip Thrust Machine', musclePrimary: 'Glutes', muscleSecondary: ['Hamstrings'], equipment: 'Machine', movementPattern: 'Hinge' },
];

type SeedSet = { reps: string; rest: number; note?: string };
type SeedWorkoutExercise = { name: string; sets: number; reps: string; rest: number; note?: string };

export type SeedWorkout = {
  key: string;
  name: string;
  dayOrder: number;
  estMinutes: number;
  equipment: string[];
  instructions: string;
  exercises: SeedWorkoutExercise[];
};

/** The note that carries the drop set, since every working set gets one. */
const DROP = 'Drop set on every set';

export const WORKOUTS: SeedWorkout[] = [
  {
    key: 'chest',
    name: 'Upper- (Chest Focused)',
    dayOrder: 1,
    estMinutes: 35,
    equipment: ['Bench', 'Body weight', 'Cable', 'Machine', 'Pull up bar', 'Smith machine'],
    instructions:
      'Take each exercise completely to failure. Use a weight that is extremely challenging and yet you can still control. We want to focus on the tempo of each exercise not just throwing the weight around. Focus on the stretch of each muscle and make sure that you are getting the most out of this workout, especially for your chest.',
    exercises: [
      { name: 'Smith Machine Incline Bench Press', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Machine Lateral Raise', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Lat Pull Down', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Cable Straight Bar Tricep Pushdown', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Machine Bicep Curl', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Hanging Leg Raise', sets: 2, reps: 'AMRAP', rest: REST_2M },
    ],
  },
  {
    key: 'back',
    name: 'Upper- (Back Focused)',
    dayOrder: 2,
    estMinutes: 30,
    equipment: ['Bench', 'Body weight', 'Cable', 'Dumbbell', 'Machine', 'Pull up bar'],
    instructions:
      'Take each exercise completely to failure. Use a weight that is extremely challenging and yet you can still control. We want to focus on the tempo of each exercise not just throwing the weight around. Focus on the stretch of each muscle and make sure that you are getting the most out of this workout. Allow for all of your back movements to have an emphasis on the stretch most of all.',
    exercises: [
      { name: 'Lying T-Bar Row', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Machine Seated Reverse Fly', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Cable Incline Chest Fly', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Dumbbell Hammer Preacher Curl', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Cable V-Bar Overhead Tricep Extension', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Hanging Leg Raise', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
    ],
  },
  {
    key: 'legs',
    name: 'Legs + Abs',
    dayOrder: 3,
    estMinutes: 41,
    equipment: ['Barbell', 'Body weight', 'Machine', 'Pull up bar'],
    instructions:
      "Leg days are always the worst, in my opinion, but if you can get through this day, you know that you've accomplished something great. Take each exercise to complete failure while using a very difficult weight, but still one that you can control. On the hack squats make sure to go all the way down with your depth to make sure that you're getting the most amount of quad activation is possible. Each of these exercises make sure to focus on the stretch of your hamstrings and quads, depending on which exercise you're doing. Get after it.",
    exercises: [
      { name: 'Hack Squat', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Machine Seated Leg Extension', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Barbell Romanian Deadlift', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Machine Lying Leg Curl', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Machine Standing Calf Raise', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Hip Thrust Machine', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Hanging Leg Raise', sets: 2, reps: 'AMRAP', rest: REST_2M },
    ],
  },
  {
    key: 'shoulders',
    name: 'Upper- (Shoulder Focused)',
    dayOrder: 4,
    estMinutes: 35,
    equipment: ['Bench', 'Cable', 'Machine', 'Smith machine'],
    instructions:
      "Shoulders were a very neglected muscle group for me, which is why I wanna make sure that I take this day as seriously as possible. Take exercise completely to failure just like the other days, but on this one we're going to emphasize growing the shoulders as much as possible. Get a deep stretch with your shoulder press don't allow yourself to mess up on this. Leave the ego lifting at the door and make sure that each muscle group gets targeted with extreme intensity, but only for two sets.",
    exercises: [
      { name: 'Smith Machine Incline Bench Press', sets: 2, reps: '6-8', rest: REST_90, note: DROP },
      { name: 'Machine Seated Shoulder Press', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Machine Lateral Raise', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Lying T-Bar Row', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Cable Straight Bar Tricep Pushdown', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
      { name: 'Machine Bicep Curl', sets: 2, reps: '6-8', rest: REST_2M, note: DROP },
    ],
  },
];

/*
  Cardio. Walking carries the whole thing — the target is 12,000 to 15,000
  steps a day, every day, rest days included — and the rest are there so a
  client with a bad knee or a treadmill preference has somewhere to put the
  work without it being logged as "walking" and skewing their step count.
*/
export const CARDIO_TYPES = [
  { name: 'Walking', unit: 'steps', defaultTarget: 12000, position: 0 },
  { name: 'Incline Treadmill', unit: 'minutes', defaultTarget: 30, position: 1 },
  { name: 'Stairmaster', unit: 'minutes', defaultTarget: 20, position: 2 },
  { name: 'Cycling', unit: 'minutes', defaultTarget: 30, position: 3 },
  { name: 'Rowing', unit: 'minutes', defaultTarget: 15, position: 4 },
];

export const DEFAULT_STEP_TARGET = 12000;

/*
  Rest-day messages.

  Five of them, rotated, because one line arriving every Thursday for six
  months reads as a cron job rather than a coach. Each one still asks for the
  steps, since the step target does not take the day off.
*/
export const REST_DAY_MESSAGES = [
  "Rest day today my man. Get your steps in and let the body recover we're going right back at it tomorrow 💪",
  "Rest day! Still want those 12-15k steps in but thats it for today. How's the body feeling",
  'Off day today brotha. Eat well hit your protein and get some sleep. Recovery is where the growth actually happens',
  "Rest day. Nothing in the gym just steps and food dialed in. Lemme know how the weeks going so far",
  'Take today off my man. Steps and protein still matter but let the muscles catch up. Back at it tomorrow',
];

/*
  The week.

  Colby's stated rest days are Thursday and Sunday, so that is what this
  builds. Weekdays are ISO — 1 is Monday, 7 is Sunday — and every single day
  carries the step target, including the two rest days.

  This is a starting point, not a rule: the program screen edits any day in
  place, and nothing here is baked into the deploy.
*/
export const WEEK: { weekday: number; kind: 'workout' | 'rest'; workout?: string; label?: string }[] = [
  { weekday: 1, kind: 'workout', workout: 'chest' },
  { weekday: 2, kind: 'workout', workout: 'legs' },
  { weekday: 3, kind: 'workout', workout: 'back' },
  { weekday: 4, kind: 'rest', label: 'REST DAY' },
  { weekday: 5, kind: 'workout', workout: 'legs' },
  { weekday: 6, kind: 'workout', workout: 'shoulders' },
  { weekday: 7, kind: 'rest', label: 'REST DAY' },
];

export const TEMPLATE_NAME = 'Transformation Program';

export type SeedResult = {
  exercisesCreated: number;
  workoutsCreated: number;
  cardioCreated: number;
  messagesCreated: number;
  templateId: string;
  missingVideos: number;
};

/**
 * Builds the program into the database for one coach.
 *
 * Idempotent by name at every level: exercises are matched on name, the
 * template on name-and-coach, workouts on name-within-template. Re-running
 * repairs anything that has drifted rather than duplicating it, and never
 * clears a video link the coach has already pasted in.
 */
export async function seedCoachProgram(coachId: string): Promise<SeedResult> {
  let exercisesCreated = 0;
  let workoutsCreated = 0;
  let cardioCreated = 0;
  let messagesCreated = 0;

  // --- movements -----------------------------------------------------------
  const exerciseIds = new Map<string, string>();
  for (const e of EXERCISES) {
    const existing = await prisma.exercise.findFirst({ where: { name: e.name } });
    if (existing) {
      exerciseIds.set(e.name, existing.id);
      continue;
    }
    const created = await prisma.exercise.create({
      data: {
        name: e.name,
        musclePrimary: e.musclePrimary,
        muscleSecondary: e.muscleSecondary,
        equipment: e.equipment,
        difficulty: 'intermediate',
        movementPattern: e.movementPattern,
        tags: [],
        substitutions: [],
      },
    });
    exerciseIds.set(e.name, created.id);
    exercisesCreated += 1;
  }

  // --- cardio --------------------------------------------------------------
  const cardioIds = new Map<string, string>();
  for (const c of CARDIO_TYPES) {
    const existing = await prisma.cardioType.findUnique({
      where: { coachId_name: { coachId, name: c.name } },
    });
    if (existing) {
      cardioIds.set(c.name, existing.id);
      continue;
    }
    const created = await prisma.cardioType.create({
      data: { coachId, name: c.name, unit: c.unit, defaultTarget: c.defaultTarget, position: c.position },
    });
    cardioIds.set(c.name, created.id);
    cardioCreated += 1;
  }
  const walkingId = cardioIds.get('Walking') ?? null;

  // --- rest-day messages ---------------------------------------------------
  const existingMessages = await prisma.autoMessage.count({
    where: { coachId, trigger: 'rest_day' },
  });
  if (existingMessages === 0) {
    for (const [i, body] of REST_DAY_MESSAGES.entries()) {
      await prisma.autoMessage.create({
        data: { coachId, trigger: 'rest_day', body, position: i },
      });
      messagesCreated += 1;
    }
  }

  // --- the template --------------------------------------------------------
  let template = await prisma.workoutTemplate.findFirst({
    where: { coachId, name: TEMPLATE_NAME },
  });
  if (!template) {
    template = await prisma.workoutTemplate.create({
      data: {
        coachId,
        name: TEMPLATE_NAME,
        description: 'Five lifting days, steps every day, rest Thursday and Sunday.',
      },
    });
  }

  // --- the four sessions ---------------------------------------------------
  const workoutIds = new Map<string, string>();
  for (const w of WORKOUTS) {
    let workout = await prisma.workout.findFirst({
      where: { templateId: template.id, name: w.name },
    });

    if (!workout) {
      workout = await prisma.workout.create({
        data: {
          templateId: template.id,
          name: w.name,
          dayOrder: w.dayOrder,
          estMinutes: w.estMinutes,
          equipment: w.equipment,
          instructions: w.instructions,
        },
      });
      workoutsCreated += 1;
    } else {
      // Repair the header on a re-run without touching the movements, which
      // the coach may have reordered by hand.
      await prisma.workout.update({
        where: { id: workout.id },
        data: { estMinutes: w.estMinutes, equipment: w.equipment, instructions: w.instructions },
      });
    }
    workoutIds.set(w.key, workout.id);

    const alreadyBuilt = await prisma.workoutExercise.count({ where: { workoutId: workout.id } });
    if (alreadyBuilt > 0) continue;

    for (const [order, ex] of w.exercises.entries()) {
      const exerciseId = exerciseIds.get(ex.name);
      if (!exerciseId) continue;

      const we = await prisma.workoutExercise.create({
        data: { workoutId: workout.id, exerciseId, order, notes: ex.note ?? null },
      });

      const sets: SeedSet[] = Array.from({ length: ex.sets }, () => ({
        reps: ex.reps,
        rest: ex.rest,
      }));
      for (const [i, s] of sets.entries()) {
        await prisma.workoutSet.create({
          data: {
            workoutExerciseId: we.id,
            setNumber: i + 1,
            type: 'working',
            targetReps: s.reps,
            restSeconds: s.rest,
          },
        });
      }
    }
  }

  // --- the week ------------------------------------------------------------
  for (const d of WEEK) {
    const workoutId = d.workout ? (workoutIds.get(d.workout) ?? null) : null;
    await prisma.programDay.upsert({
      where: { templateId_weekday: { templateId: template.id, weekday: d.weekday } },
      create: {
        templateId: template.id,
        weekday: d.weekday,
        kind: d.kind,
        workoutId,
        label: d.label ?? null,
        cardioTypeId: walkingId,
        stepTarget: DEFAULT_STEP_TARGET,
      },
      // A re-run must not stomp a week the coach has since rearranged.
      update: {},
    });
  }

  const missingVideos = await prisma.exercise.count({
    where: { name: { in: EXERCISES.map((e) => e.name) }, videoUrl: null },
  });

  return {
    exercisesCreated,
    workoutsCreated,
    cardioCreated,
    messagesCreated,
    templateId: template.id,
    missingVideos,
  };
}
