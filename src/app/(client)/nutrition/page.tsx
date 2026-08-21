import { Trash2 } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  SystemWindow,
  SystemWindowContent,
  Count,
} from '@/components/ui/system-window';
import { signMealPhotoUrls } from '@/lib/meal-photos';
import { MealPhotoLogger } from '@/components/meal-photo-logger';
import { MealPlanCard } from '@/components/meal-plan-card';
import { getActivePlan } from '@/lib/meal-plans';
import { logMeal, logFood, quickAddFood, removeMealLog } from './actions';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

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

export default async function NutritionPage({
  searchParams,
}: {
  searchParams: { q?: string; cat?: string };
}) {
  const user = await requireClient();
  const today = todayDateOnly();

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
      orderBy: { createdAt: 'desc' },
    }),
    prisma.recipe.findMany({ orderBy: { title: 'asc' } }),
    /*
      Search wins over category when both are present. With no search term and
      no category we show a small slice rather than all 247 — a wall of food is
      not a starting point, and the categories are the way in.
    */
    prisma.food.findMany({
      where: {
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

  // Matched on name because a plan line and the log it produced carry the
  // same one. Not an id join: a client who logs the same meal from the photo
  // logger or the food search should still see that line come off the plan.
  const loggedNames = new Set(
    todayLogs.map((l) => (l.name ?? l.recipe?.title ?? l.food?.name ?? '').toLowerCase()).filter(Boolean)
  );

  const caloriesEaten = todayLogs.reduce((sum, l) => sum + l.calories, 0);
  const proteinEaten = todayLogs.reduce((sum, l) => sum + Number(l.protein), 0);
  const carbsEaten = todayLogs.reduce((sum, l) => sum + Number(l.carbs), 0);
  const fatEaten = todayLogs.reduce((sum, l) => sum + Number(l.fat), 0);

  const macros = target
    ? [
        { label: 'Calories', eaten: caloriesEaten, goal: target.calories, unit: '' },
        { label: 'Protein', eaten: Math.round(proteinEaten), goal: Math.round(Number(target.protein)), unit: 'g' },
        { label: 'Carbs', eaten: Math.round(carbsEaten), goal: Math.round(Number(target.carbs)), unit: 'g' },
        { label: 'Fat', eaten: Math.round(fatEaten), goal: Math.round(Number(target.fat)), unit: 'g' },
      ]
    : [];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="readout text-[11px] uppercase text-muted-foreground">Today</p>
        <h1 className="display mt-1.5 text-2xl">Nutrition</h1>
      </header>

      <SystemWindow title="Totals">
        <SystemWindowContent className="flex flex-col gap-4 pt-4">
          {target ? (
            macros.map((m) => (
              <div key={m.label}>
                <div className="mb-2 flex items-baseline justify-between text-sm">
                  <span>{m.label}</span>
                  <Count value={m.eaten} total={`${m.goal}${m.unit}`} />
                </div>
                <Progress value={Math.min((m.eaten / Math.max(m.goal, 1)) * 100, 100)} />
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">
              Your coach hasn&apos;t set your targets yet.
            </p>
          )}
        </SystemWindowContent>
      </SystemWindow>

      {todayLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Logged today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {todayLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between gap-3 border-b border-border/50 py-3 last:border-b-0"
              >
                {log.photoPath && photoUrls.get(log.photoPath) && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={photoUrls.get(log.photoPath)}
                    alt=""
                    className="h-12 w-12 shrink-0 border border-border object-cover"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {log.recipe?.title ?? log.food?.name ?? log.name ?? 'Meal'}
                  </p>
                  <p className="readout mt-0.5 text-[10px] uppercase text-muted-foreground">
                    {log.meal ? `${log.meal} · ` : ''}
                    {log.calories} cal · {Math.round(Number(log.protein))}p ·{' '}
                    {Math.round(Number(log.carbs))}c · {Math.round(Number(log.fat))}f
                  </p>
                </div>
                <form action={removeMealLog}>
                  <input type="hidden" name="logId" value={log.id} />
                  <button
                    type="submit"
                    aria-label="Remove"
                    className="text-muted-foreground transition-colors hover:text-destructive"
                  >
                    <Trash2 size={15} />
                  </button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/*
        Search first. A client who knows what they ate types it; a client who
        doesn't browses a category. Plain GET form so it works with no JS and
        the result is a linkable URL.
      */}
      {/*
        The plan comes before every logging control on this page. Somebody
        opening the nutrition screen at 11am is asking what to eat, not
        recording what they already ate — and until now the first thing they
        met was a search box, which only helps a person who already knows the
        answer.
      */}
      {plan && <MealPlanCard plan={plan} loggedNames={loggedNames} />}

      {/*
        First, because it's the way most meals actually get logged. Searching a
        library assumes you already know what a portion weighs; a photo doesn't
        assume anything, which is why this is the one clients will use standing
        at a table with the food in front of them.
      */}
      <SystemWindow title="Log from a photo">
        <SystemWindowContent className="pt-4">
          <MealPhotoLogger />
        </SystemWindowContent>
      </SystemWindow>

      <SystemWindow title="Add food">
        <SystemWindowContent className="flex flex-col gap-4 pt-4">
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
                  ? `Nothing matching “${q}”. Use quick add below and it'll count just the same.`
                  : 'Pick a category or search to get started.'}
              </p>
            ) : (
              foods.map((food) => (
                <div
                  key={food.id}
                  className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                >
                  <div className="min-w-0 sm:flex-1">
                    <p className="text-sm font-medium">{food.name}</p>
                    <p className="readout mt-0.5 text-[10px] uppercase text-muted-foreground">
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
                      className="readout h-9 w-16 rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                    />
                    <select name="meal" defaultValue="snack" aria-label="Meal" className={selectClass}>
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
        </SystemWindowContent>
      </SystemWindow>

      {/*
        The escape hatch, for when the numbers are already known — a label, a
        chain restaurant, something the coach macro'd earlier.
      */}
      <SystemWindow title="Quick add">
        <SystemWindowContent className="pt-4">
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
                  <span className="readout text-[10px] uppercase text-muted-foreground">{f.l}</span>
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
        </SystemWindowContent>
      </SystemWindow>

      {recipes.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Coach recipes</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col">
            {recipes.map((recipe) => (
              <div
                key={recipe.id}
                className="flex flex-col gap-2 border-b border-border/50 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <div className="min-w-0 sm:flex-1">
                  <p className="text-sm font-medium">{recipe.title}</p>
                  <p className="readout mt-0.5 text-[10px] uppercase text-muted-foreground">
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
                    className="readout h-9 w-16 rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
                  />
                  <select name="meal" defaultValue="snack" aria-label="Meal" className={selectClass}>
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
          </CardContent>
        </Card>
      )}
    </div>
  );
}
