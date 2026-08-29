import Link from 'next/link';
import { Check, ChevronDown, Trash2 } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import { prisma } from '@/lib/prisma';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SystemWindow, SystemWindowContent, Count } from '@/components/ui/system-window';
import { signMealPhotoUrls } from '@/lib/meal-photos';
import { MealPhotoLogger } from '@/components/meal-photo-logger';
import { getActivePlan } from '@/lib/meal-plans';
import {
  daySections,
  eatenTotals,
  fillPercent,
  formatRange,
  headline,
  loggedNameSet,
  nextOpenSlot,
  type LoggedEntry,
  type PlanItem,
} from '@/lib/nutrition-day';
import { logMeal, logFood, logPlanItem, quickAddFood, removeMealLog } from './actions';

/*
  The client's nutrition screen.

  It used to show everything at once and at the same size: four progress bars,
  a list of what had been logged with four macros on every line, the plan with
  four macros on every line, a food library with four macros on every line, a
  photo uploader, a five-field quick-add form and the whole recipe list —
  about sixty numbers, none of them louder than any other. A client opening it
  at 2pm to ask "am I okay, and what do I eat next" had to work that out
  themselves.

  So the page now answers three questions in order, and only the first one is
  loud:

    1. How much room have I got left?  — one number, the size of a headline.
    2. What does my day look like?     — the plan and the logs, merged, one
                                         meal at a time.
    3. How do I add something?         — folded away until it's wanted.

  Nothing was removed. Carbs and fat are still here, the food library is still
  here, the recipes are still here — they're just no longer competing with the
  one number that decides the day.
*/

const MEAL_OPTIONS = ['breakfast', 'lunch', 'dinner', 'snack'];

const CATEGORIES = [
  'Protein',
  'Carbs',
  'Fats',
  'Veg',
  'Fruit',
  'Dairy',
  'Meals',
  'Snacks',
  'Drinks',
  'Condiments',
  'Custom',
];

const selectClass =
  'readout h-9 rounded-none border border-input bg-secondary/40 px-2 text-[11px] uppercase ' +
  'text-foreground focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 ' +
  'focus-visible:ring-accent/50';

const numberClass =
  'readout h-9 w-16 rounded-none border border-input bg-secondary/40 px-2 text-sm ' +
  'focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50';

/*
  What the coach has (or hasn't) done with a logged photo.

  The photo logger promises "your coach will confirm it", and four separate
  paragraphs used to say how that went — one per state, each on its own line
  under the meal. It's one word's worth of information, so it's one chip now.
*/
const REVIEW_NOTE: Record<string, { text: string; tone: string }> = {
  estimated: { text: 'Estimate', tone: 'text-muted-foreground' },
  failed: { text: 'Couldn’t read — add the numbers', tone: 'text-destructive' },
  corrected: { text: 'Coach corrected', tone: 'text-success' },
  confirmed: { text: 'Coach confirmed', tone: 'text-success' },
};

/**
 * One thing the client could eat for this meal.
 *
 * Pulled out of the page because it is now rendered from two places — inside
 * an unopened meal, and under the already-eaten lines of a meal in progress.
 */
function PlanOption({ item }: { item: PlanItem }) {
  return (
    <div className="flex items-center gap-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-muted-foreground">
          {item.recipeId ? (
            <Link
              href={`/recipes/${item.recipeId}`}
              className="underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent"
            >
              {item.name}
            </Link>
          ) : (
            item.name
          )}
          {item.quantity !== 1 && (
            <span className="readout ml-2 text-[10px] uppercase">×{item.quantity}</span>
          )}
        </p>
        <p className="readout mt-0.5 text-[10px] text-muted-foreground">
          {item.calories} cal · {item.protein}p{item.note ? ` · ${item.note}` : ''}
        </p>
      </div>
      <form action={logPlanItem} className="shrink-0">
        <input type="hidden" name="itemId" value={item.id} />
        <button
          type="submit"
          className="readout border border-border/70 px-2.5 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent focus-visible:border-accent focus-visible:outline-none"
        >
          {/* Not "Log" — this is a choice being made, and "had this" is the
              sentence the client is actually saying when they tap it. */}
          Had this
        </button>
      </form>
    </div>
  );
}

/**
 * A section that stays shut until somebody wants it.
 *
 * Native `<details>` on purpose: this is a server component, the page has to
 * work before any JavaScript arrives, and a client who taps "Search foods"
 * with a dead network should still get the search box.
 */
function Fold({
  label,
  hint,
  open,
  children,
}: {
  label: string;
  hint?: string;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group border-b border-border/50 last:border-b-0">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 py-3.5 text-sm transition-colors hover:text-accent [&::-webkit-details-marker]:hidden">
        <span>{label}</span>
        <span className="readout flex items-center gap-2 text-[10px] uppercase text-muted-foreground">
          {hint}
          <ChevronDown
            size={14}
            aria-hidden
            className="transition-transform duration-200 group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string };
}) {
  const user = await requireEntitledClient();
  const today = todayFor(user);

  const q = (searchParams.q ?? '').trim();
  const cat = searchParams.cat ?? '';

  const [target, todayLogs, recipes, foods, plan] = await Promise.all([
    prisma.nutritionTarget.findFirst({
      where: { clientId: user.id, effectiveDate: { lte: today } },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.nutritionLog.findMany({
      where: { clientId: user.id, date: today },
      include: { recipe: true, food: true },
      orderBy: { createdAt: 'asc' },
    }),
    /*
      Six columns, not the whole recipe.

      This list shows a title and a macro line, and nothing else — but it was
      selecting every column, which on this model means the full method text,
      the ingredients JSON and the tags, for every recipe there is. All of it
      was fetched, serialised into the page and sent to a phone, so that a
      client could read a name and four numbers. The method is on the recipe's
      own page, which is where the link goes.
    */
    prisma.recipe.findMany({
      select: { id: true, title: true, calories: true, protein: true, carbs: true, fat: true },
      orderBy: { title: 'asc' },
    }),
    /*
      Search wins over category when both are present. With no search term and
      no category we show a small slice rather than all 247 — a wall of food is
      not a starting point, and the categories are the way in.
    */
    prisma.food.findMany({
      where: {
        // The shared library, plus anything this client saved themselves.
        // Unscoped, one person's "Mom's lasagna" was in everybody's results.
        OR: [{ ownerId: null }, { ownerId: user.id }],
        ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
        ...(!q && cat ? { category: cat } : {}),
      },
      orderBy: [{ name: 'asc' }],
      take: q || cat ? 60 : 12,
    }),
    getActivePlan(user.id),
  ]);

  const photoUrls = await signMealPhotoUrls(
    todayLogs.map((l) => l.photoPath).filter((p): p is string => Boolean(p))
  );

  const logs: LoggedEntry[] = todayLogs.map((l) => ({
    id: l.id,
    meal: l.meal,
    name: l.recipe?.title ?? l.food?.name ?? l.name ?? 'Meal',
    calories: l.calories,
    protein: Number(l.protein),
    carbs: Number(l.carbs),
    fat: Number(l.fat),
    photoPath: l.photoPath,
    reviewState: l.reviewState,
  }));

  const eaten = eatenTotals(logs);
  const alreadyEaten = loggedNameSet(logs);
  const sections = daySections(plan?.items ?? [], logs);
  const openSlot = nextOpenSlot(sections);

  const calorieGoal = target?.calories ?? null;
  const proteinGoal = target ? Math.round(Number(target.protein)) : null;
  const head = headline(eaten.calories, calorieGoal);

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="readout text-[11px] uppercase text-muted-foreground">Nutrition</p>
        <h1 className="display mt-1.5 text-2xl">Today</h1>
      </header>

      {/*
        The headline.

        One number, and the word that says what it means. "1,240 left" and
        "240 over" are the two sentences that change what somebody does next;
        a row of four equal progress bars was neither of them.
      */}
      <SystemWindow>
        <SystemWindowContent className="flex flex-col gap-5">
          <div>
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="display text-5xl leading-none tabular-nums">
                  {head.amount.toLocaleString('en-US')}
                </p>
                <p className="readout mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">
                  {head.kind === 'left'
                    ? 'calories left'
                    : head.kind === 'over'
                      ? 'calories over'
                      : 'calories eaten'}
                </p>
              </div>
              {calorieGoal && (
                <p className="readout pb-1 text-right text-[11px] text-muted-foreground">
                  {eaten.calories.toLocaleString('en-US')} of{' '}
                  {calorieGoal.toLocaleString('en-US')}
                </p>
              )}
            </div>
            {calorieGoal && (
              <Progress className="mt-3" value={fillPercent(eaten.calories, calorieGoal)} />
            )}
          </div>

          {/*
            Protein second, and the only other thing with a bar. It's the
            number this coach actually chases, and it's a floor rather than a
            budget — beating it is the win, so it never turns red.
          */}
          {proteinGoal ? (
            <div>
              <div className="mb-2 flex items-baseline justify-between text-sm">
                <span>Protein</span>
                <Count value={Math.round(eaten.protein)} total={`${proteinGoal}g`} mode="reach" />
              </div>
              <Progress value={fillPercent(eaten.protein, proteinGoal)} />
            </div>
          ) : null}

          {/*
            Carbs and fat are real, and they are not the headline. One quiet
            line, no bars — they were never the thing a day turns on, and
            giving them equal billing is most of why this screen felt like
            homework.
          */}
          {target && (
            <p className="readout text-[11px] text-muted-foreground">
              Carbs {Math.round(eaten.carbs)}/{Math.round(Number(target.carbs))}g
              <span className="px-2 opacity-40">·</span>
              Fat {Math.round(eaten.fat)}/{Math.round(Number(target.fat))}g
            </p>
          )}

          {!target && (
            <p className="text-sm text-muted-foreground">
              Your coach hasn&apos;t set your targets yet — everything you log still counts, and
              they&apos;ll see it.
            </p>
          )}
        </SystemWindowContent>
      </SystemWindow>

      {/*
        The day itself, one meal at a time.

        The plan and the log used to be two separate cards, which left the
        client doing the join in their head at every meal — scroll up to see
        what was planned, scroll down to see whether it had been logged. Here
        Breakfast is a heading with both underneath it: the choices, then what
        you actually had.

        A plan line is a CHOICE. Seven breakfasts under Breakfast means seven
        things you could have this morning, one of which you will — reading
        them as a stack of courses is what made a client's screen announce
        18,485 calories. So an uneaten meal reads "pick one", and the moment
        something is logged the rest fold away behind a swap link instead of
        sitting there looking like homework.
      */}
      <SystemWindow title="Your day" meta={plan ? plan.name : undefined}>
        <SystemWindowContent className="flex flex-col gap-5 pt-4">
          {plan?.note && (
            <p className="text-sm leading-relaxed text-muted-foreground">{plan.note}</p>
          )}

          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing logged yet today. The fastest way in is a photo of your plate — it&apos;s the
              first thing below.
            </p>
          ) : (
            sections.map((section) => {
              const toEat = section.planned.filter(
                (i) => !alreadyEaten.has(i.name.trim().toLowerCase())
              );

              /*
                A meal nobody has eaten yet is ONE line until it's opened.

                Three meals with seven options each put twenty-one rows between
                the client and the bottom of the screen, and the twenty of them
                they aren't going to eat are in the way of the one they are. So
                an untouched meal collapses to its own heading, and the meal
                they're actually about to eat — the first one with nothing
                logged — is the one that starts open.

                A meal with something logged never collapses: what you ate is
                the record of the day and shouldn't need a tap to see.
              */
              if (section.logged.length === 0) {
                return (
                  <details
                    key={section.slot}
                    open={section.slot === openSlot}
                    className="group/meal flex flex-col"
                  >
                    <summary className="flex cursor-pointer list-none items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 [&::-webkit-details-marker]:hidden">
                      <span className="readout flex items-baseline gap-2 text-[11px] uppercase tracking-wider text-foreground">
                        {section.slot}
                        {toEat.length > 1 && (
                          <span className="normal-case tracking-normal text-muted-foreground">
                            {toEat.length} options
                          </span>
                        )}
                        <ChevronDown
                          size={12}
                          aria-hidden
                          className="self-center text-muted-foreground transition-transform duration-200 group-open/meal:rotate-180"
                        />
                      </span>
                      <span className="readout text-[10px] text-muted-foreground">
                        {formatRange(section.plannedCalories)} cal
                      </span>
                    </summary>

                    {toEat.length > 1 && (
                      <span className="readout pt-2 text-[10px] uppercase text-muted-foreground">
                        Pick one
                      </span>
                    )}
                    {toEat.map((item) => (
                      <PlanOption key={item.id} item={item} />
                    ))}
                  </details>
                );
              }

              return (
                <div key={section.slot} className="flex flex-col">
                  <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5">
                    <span className="readout text-[11px] uppercase tracking-wider text-foreground">
                      {section.slot}
                    </span>
                    <span className="readout text-[10px] text-muted-foreground">
                      {section.calories.toLocaleString('en-US')} cal · {section.protein}p
                    </span>
                  </div>

                  {section.logged.map((log) => {
                    const note = log.reviewState ? REVIEW_NOTE[log.reviewState] : undefined;
                    const url = log.photoPath ? photoUrls.get(log.photoPath) : undefined;
                    return (
                      <div key={log.id} className="flex items-center gap-3 py-2.5">
                        {url && (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            src={url}
                            alt=""
                            className="h-10 w-10 shrink-0 border border-border object-cover"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{log.name}</p>
                          <p className="readout mt-0.5 text-[10px] text-muted-foreground">
                            {log.calories} cal · {Math.round(log.protein)}p ·{' '}
                            {Math.round(log.carbs)}c · {Math.round(log.fat)}f
                            {note && (
                              <>
                                <span className="px-1.5 opacity-40">·</span>
                                <span className={note.tone}>{note.text}</span>
                              </>
                            )}
                          </p>
                        </div>
                        <form action={removeMealLog} className="shrink-0">
                          <input type="hidden" name="logId" value={log.id} />
                          <button
                            type="submit"
                            aria-label={`Remove ${log.name}`}
                            className="text-muted-foreground transition-colors hover:text-destructive"
                          >
                            <Trash2 size={15} />
                          </button>
                        </form>
                      </div>
                    );
                  })}

                  {/*
                    What's left of the choices, shut. Somebody who has eaten
                    breakfast doesn't need six more breakfasts on screen, but
                    somebody adding a second thing to the same meal still needs
                    to reach them — so it folds rather than disappearing.
                  */}
                  {toEat.length > 0 && (
                    <details className="group/opts mt-1 flex flex-col">
                      <summary className="flex cursor-pointer list-none items-center gap-2 py-1 [&::-webkit-details-marker]:hidden">
                        <span className="readout text-[10px] uppercase text-muted-foreground">
                          {toEat.length} other {toEat.length === 1 ? 'option' : 'options'}
                        </span>
                        <ChevronDown
                          size={12}
                          aria-hidden
                          className="text-muted-foreground transition-transform duration-200 group-open/opts:rotate-180"
                        />
                      </summary>
                      {toEat.map((item) => (
                        <PlanOption key={item.id} item={item} />
                      ))}
                    </details>
                  )}

                  {/* Nothing left to choose from and something is in. */}
                  {section.planned.length > 0 && toEat.length === 0 && (
                    <p className="readout flex items-center gap-1.5 pt-2 text-[10px] uppercase text-success">
                      <Check size={12} /> That&apos;s the meal in
                    </p>
                  )}
                </div>
              );
            })
          )}
        </SystemWindowContent>
      </SystemWindow>

      {/*
        Every way of adding food, in one window, folded.

        These were four separate cards stacked down the page, all open, all the
        time — roughly two screens of form controls under the part of the page
        anybody actually reads. The photo is open because it's how most meals
        really get logged: searching a library assumes you already know what a
        portion weighs, and a photo assumes nothing.
      */}
      <SystemWindow title="Add food">
        <SystemWindowContent className="flex flex-col pt-4">
          <Fold label="Take a photo" hint="Fastest" open>
            <MealPhotoLogger />
          </Fold>

          <Fold
            label="Search foods"
            hint={q || cat ? 'Showing results' : undefined}
            open={Boolean(q || cat)}
          >
            <div className="flex flex-col gap-4">
              {/* Plain GET form: works with no JS, and the result is a URL
                  somebody can bookmark or send. */}
              <form method="GET" className="flex gap-2">
                <Input
                  name="q"
                  defaultValue={q}
                  placeholder="Search foods…"
                  className="flex-1"
                  aria-label="Search foods"
                />
                <Button type="submit" variant="outline" size="sm">
                  Search
                </Button>
              </form>

              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <a
                    key={c}
                    href={`/nutrition?cat=${encodeURIComponent(c)}`}
                    className={
                      'readout border px-2 py-1 text-[10px] uppercase transition-colors ' +
                      (cat === c && !q
                        ? 'border-accent/50 bg-accent/10 text-accent'
                        : 'border-border text-muted-foreground hover:border-accent/40 hover:text-accent')
                    }
                  >
                    {c}
                  </a>
                ))}
              </div>

              <div className="flex flex-col">
                {foods.length === 0 ? (
                  <p className="py-2 text-sm text-muted-foreground">
                    {q
                      ? `Nothing matching “${q}”. Enter it yourself below and it'll count just the same.`
                      : 'Pick a category or search to get started.'}
                  </p>
                ) : (
                  foods.map((food) => (
                    <div
                      key={food.id}
                      className="flex flex-col gap-2 border-b border-border/40 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                    >
                      <div className="min-w-0 sm:flex-1">
                        <p className="text-sm">{food.name}</p>
                        <p className="readout mt-0.5 text-[10px] text-muted-foreground">
                          {food.servingSize} · {food.calories} cal ·{' '}
                          {Math.round(Number(food.protein))}p · {Math.round(Number(food.carbs))}c ·{' '}
                          {Math.round(Number(food.fat))}f
                        </p>
                      </div>
                      <form action={logFood} className="flex shrink-0 items-center gap-2">
                        <input type="hidden" name="foodId" value={food.id} />
                        <input
                          type="number"
                          name="quantity"
                          step="0.25"
                          min="0.25"
                          defaultValue="1"
                          aria-label="Servings"
                          className={numberClass}
                        />
                        <select
                          name="meal"
                          defaultValue="snack"
                          aria-label="Meal"
                          className={selectClass}
                        >
                          {MEAL_OPTIONS.map((m) => (
                            <option key={m} value={m}>
                              {m}
                            </option>
                          ))}
                        </select>
                        <Button type="submit" variant="outline" size="sm">
                          Log
                        </Button>
                      </form>
                    </div>
                  ))
                )}
              </div>
            </div>
          </Fold>

          {/* The escape hatch, for when the numbers are already known — a
              label, a chain restaurant, something the coach macro'd earlier. */}
          <Fold label="Enter it myself">
            <form action={quickAddFood} encType="multipart/form-data" className="flex flex-col gap-3">
              <Input name="name" required maxLength={120} placeholder="What did you eat?" />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  { n: 'calories', l: 'Calories', req: true },
                  { n: 'protein', l: 'Protein g', req: false },
                  { n: 'carbs', l: 'Carbs g', req: false },
                  { n: 'fat', l: 'Fat g', req: false },
                ].map((f) => (
                  <label key={f.n} className="flex flex-col gap-1">
                    <span className="readout text-[10px] uppercase text-muted-foreground">
                      {f.l}
                    </span>
                    <input
                      type="number"
                      name={f.n}
                      min="0"
                      step="1"
                      required={f.req}
                      defaultValue={f.req ? undefined : 0}
                      className="readout h-10 w-full rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                    />
                  </label>
                ))}
              </div>
              <label className="flex flex-col gap-1">
                <span className="readout text-[10px] uppercase text-muted-foreground">
                  Photo (optional)
                </span>
                <input
                  type="file"
                  name="photo"
                  accept="image/*"
                  capture="environment"
                  className="readout w-full rounded-none border border-input bg-secondary/40 p-2 text-[11px] file:mr-3 file:rounded-none file:border-0 file:bg-secondary file:px-3 file:py-1 file:text-[10px] file:uppercase file:tracking-wider file:text-foreground"
                />
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <select name="meal" defaultValue="snack" aria-label="Meal" className={selectClass}>
                    {MEAL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                  <label className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      name="save"
                      className="h-4 w-4 rounded-none border-border bg-secondary accent-[hsl(var(--accent))]"
                    />
                    <span className="readout text-[10px] uppercase text-muted-foreground">
                      Save for next time
                    </span>
                  </label>
                </div>
                <Button type="submit" size="sm">
                  Add
                </Button>
              </div>
            </form>
          </Fold>

          {recipes.length > 0 && (
            <Fold label="Coach recipes" hint={`${recipes.length}`}>
              <div className="flex flex-col">
                {recipes.map((recipe) => (
                  <div
                    key={recipe.id}
                    className="flex flex-col gap-2 border-b border-border/40 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0 sm:flex-1">
                      <p className="text-sm">
                        <Link
                          href={`/recipes/${recipe.id}`}
                          className="underline decoration-accent/40 underline-offset-4 transition-colors hover:text-accent"
                        >
                          {recipe.title}
                        </Link>
                      </p>
                      <p className="readout mt-0.5 text-[10px] text-muted-foreground">
                        {recipe.calories} cal · {Math.round(Number(recipe.protein))}p ·{' '}
                        {Math.round(Number(recipe.carbs))}c · {Math.round(Number(recipe.fat))}f
                      </p>
                    </div>
                    <form action={logMeal} className="flex shrink-0 items-center gap-2">
                      <input type="hidden" name="recipeId" value={recipe.id} />
                      <input
                        type="number"
                        name="quantity"
                        step="0.25"
                        min="0.25"
                        defaultValue="1"
                        aria-label="Servings"
                        className={numberClass}
                      />
                      <select
                        name="meal"
                        defaultValue="snack"
                        aria-label="Meal"
                        className={selectClass}
                      >
                        {MEAL_OPTIONS.map((m) => (
                          <option key={m} value={m}>
                            {m}
                          </option>
                        ))}
                      </select>
                      <Button type="submit" variant="outline" size="sm">
                        Log
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </Fold>
          )}
        </SystemWindowContent>
      </SystemWindow>
    </div>
  );
}
