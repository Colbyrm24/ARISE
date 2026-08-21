import { AlertTriangle, Check, Trash2 } from 'lucide-react';
import { requireCoach } from '@/lib/auth';
import { getPendingMeals, getReadAccuracy, type PendingMeal } from '@/lib/meal-review';
import { SystemWindow, SystemWindowContent, Count } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { confirmMeal, correctMeal, discardMeal } from './actions';

export const dynamic = 'force-dynamic';

function ago(date: Date) {
  const mins = Math.floor((Date.now() - date.getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const CONFIDENCE_TONE = {
  high: 'text-success',
  medium: 'text-muted-foreground',
  low: 'text-destructive',
} as const;

const numberField =
  'readout h-9 w-full min-w-0 rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50';

function MealCard({ meal }: { meal: PendingMeal }) {
  const est = meal.estimate;

  return (
    <div className="border border-border bg-card">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/60 px-3 py-2">
        <span className="readout flex h-7 w-7 shrink-0 items-center justify-center border border-border bg-secondary text-[10px] text-muted-foreground">
          {meal.initials}
        </span>
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{meal.clientName}</span>
        <span className="readout text-[10px] uppercase text-muted-foreground">
          {meal.meal ? `${meal.meal} · ` : ''}
          {ago(meal.loggedAt)}
        </span>
      </div>

      <div className="flex flex-col gap-4 p-3 md:flex-row">
        {meal.photoUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.photoUrl}
            alt={`${meal.clientName}'s ${meal.name}`}
            // self-start, or the photo stretches to whatever height the text
            // beside it happens to be — a plate with four items would render
            // twice the size of a plate with two, for no reason.
            className="max-h-56 w-full self-start border border-border object-cover md:max-h-72 md:w-56 md:shrink-0"
          />
        )}

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {meal.failure ? (
            <div className="flex items-start gap-2 border border-destructive/40 bg-destructive/[0.06] p-2">
              <AlertTriangle size={14} className="mt-0.5 shrink-0 text-destructive" />
              <p className="text-xs leading-relaxed">
                {meal.failure} Nothing was counted against their day — put the numbers in below.
              </p>
            </div>
          ) : (
            est && (
              <>
                <div>
                  <p className="text-sm font-medium">{est.name}</p>
                  <p
                    className={`readout mt-0.5 text-[10px] uppercase ${CONFIDENCE_TONE[est.confidence]}`}
                  >
                    {est.confidence} confidence
                    {est.adjusted && ' · totals were reconciled'}
                  </p>
                </div>

                {/*
                  The portions, not just the totals. This is the row that makes
                  the queue faster than a text thread: the coach reads "8 oz
                  cooked" and knows immediately whether to argue with it.
                */}
                <ul className="flex flex-col gap-1">
                  {est.items.map((item, i) => (
                    <li
                      key={`${item.name}-${i}`}
                      // Stacked on a phone rather than wrapped: a wrapped row
                      // puts the macros beside a short item name and under a
                      // long one, so the column of numbers stops being a
                      // column and the list gets hard to scan.
                      className="flex flex-col gap-0.5 border-b border-border/40 pb-1 last:border-b-0 sm:flex-row sm:items-baseline sm:justify-between sm:gap-3"
                    >
                      <span className="min-w-0 text-xs">
                        {item.name}
                        <span className="readout ml-2 text-[10px] uppercase text-muted-foreground">
                          {item.portion}
                        </span>
                      </span>
                      <span className="readout shrink-0 text-[10px] text-muted-foreground">
                        {item.calories} cal · {item.protein}p · {item.carbs}c · {item.fat}f
                      </span>
                    </li>
                  ))}
                </ul>

                {est.note && (
                  <p className="text-xs leading-relaxed text-muted-foreground">{est.note}</p>
                )}
              </>
            )
          )}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <Count value={meal.calories} unit=" cal" />
            <Count value={meal.protein} unit="g protein" />
            <Count value={meal.carbs} unit="g carbs" />
            <Count value={meal.fat} unit="g fat" />
          </div>

          {/*
            Two forms, not one with a mode switch. Confirming is the common
            case and has to stay a single tap; the moment it shares a submit
            button with the edit fields it stops being one.
          */}
          <div className="flex flex-wrap items-center gap-2">
            {!meal.failure && (
              <form action={confirmMeal}>
                <input type="hidden" name="logId" value={meal.id} />
                <Button type="submit" size="sm">
                  <Check size={14} /> Looks right
                </Button>
              </form>
            )}
            <form action={discardMeal}>
              <input type="hidden" name="logId" value={meal.id} />
              <Button type="submit" size="sm" variant="ghost">
                <Trash2 size={14} /> Discard
              </Button>
            </form>
          </div>

          <form action={correctMeal} className="flex flex-col gap-2 border-t border-border/60 pt-3">
            <input type="hidden" name="logId" value={meal.id} />
            <input
              name="name"
              defaultValue={meal.name}
              maxLength={120}
              aria-label="Meal name"
              className="h-9 w-full rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
            />
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {[
                { n: 'calories', l: 'Cal', v: meal.calories },
                { n: 'protein', l: 'Protein', v: meal.protein },
                { n: 'carbs', l: 'Carbs', v: meal.carbs },
                { n: 'fat', l: 'Fat', v: meal.fat },
              ].map((f) => (
                <label key={f.n} className="flex min-w-0 flex-col gap-1">
                  <span className="readout text-[10px] uppercase text-muted-foreground">{f.l}</span>
                  <input
                    type="number"
                    name={f.n}
                    min="0"
                    step="1"
                    defaultValue={f.v}
                    className={numberField}
                  />
                </label>
              ))}
            </div>
            <Button type="submit" size="sm" variant="outline" className="self-start">
              Save corrected
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

export default async function CoachMealsPage() {
  await requireCoach();
  const [meals, accuracy] = await Promise.all([getPendingMeals(), getReadAccuracy()]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1>Meals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos your clients logged, read and waiting on you.
        </p>
      </div>

      {accuracy && accuracy.medianCalorieGapPct !== null && (
        <SystemWindow title="How the reads are running" plain>
          <SystemWindowContent className="pt-3">
            <p className="text-sm leading-relaxed">
              Across {accuracy.corrected} correction{accuracy.corrected === 1 ? '' : 's'}, reads
              land about{' '}
              <span className="readout text-accent">{accuracy.medianCalorieGapPct}%</span>{' '}
              {accuracy.direction === 'high' ? 'over' : 'under'} where you put them, and you&apos;ve
              agreed with {accuracy.confirmed} as-is.
            </p>
          </SystemWindowContent>
        </SystemWindow>
      )}

      {meals.length === 0 ? (
        <SystemWindow title="Clear">
          <SystemWindowContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              Nothing waiting. Every photo logged today has your number on it.
            </p>
          </SystemWindowContent>
        </SystemWindow>
      ) : (
        <div className="flex flex-col gap-4">
          {meals.map((meal) => (
            <MealCard key={meal.id} meal={meal} />
          ))}
        </div>
      )}
    </div>
  );
}
