import { X, Send, CalendarRange } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getActivePlan, planVsTarget, MEAL_SLOTS } from '@/lib/meal-plans';
import {
  addPlanItem,
  removePlanItem,
  updatePlan,
  publishPlan,
  retirePlan,
  assignStandardWeek,
} from '@/app/coach/clients/[id]/plan-actions';

/*
  Where the coach writes a client's day.

  The check against their target is the part that earns this card's place. A
  plan that reads sensible meal by meal can still come to 2,850 against a
  3,200 target, and that is a stall nobody diagnoses for a month because
  nothing on any screen ever adds it up.
*/

const selectClass =
  'readout h-9 rounded-none border border-input bg-secondary/40 px-2 text-[11px] uppercase tracking-wider focus-visible:border-accent/60 focus-visible:outline-none';
const fieldClass =
  'h-9 min-w-0 rounded-none border border-input bg-secondary/40 px-2 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none';

export async function CoachMealPlanCard({ clientId }: { clientId: string }) {
  const plan = await getActivePlan(clientId);
  const [recipes, check] = await Promise.all([
    prisma.recipe.findMany({ orderBy: { title: 'asc' }, take: 200 }),
    plan ? planVsTarget(clientId, plan.totals) : Promise.resolve(null),
  ]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meal plan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!plan ? (
          <div className="flex flex-col gap-3">
            <p className="text-xs text-muted-foreground">
              None yet. Add a line below and the plan is created with it — it shows on their
              nutrition screen above everything else, so they open the app to a day rather than a
              search box.
            </p>
            {/*
              Or skip all of that. Twenty-one lines typed by hand is the long
              way round to the answer that is right most of the time, which is
              "put them on the standard week and adjust from there".
            */}
            <form action={assignStandardWeek}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button type="submit" size="sm" variant="outline" className="w-full sm:w-auto">
                <CalendarRange size={14} /> Put them on the 7-day plan
              </Button>
            </form>
            <p className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
              [7 days · 21 meals · ~2600 cal · ~190g protein]
            </p>
          </div>
        ) : (
          <>
            <form action={updatePlan} className="flex flex-col gap-2">
              <input type="hidden" name="planId" value={plan.id} />
              <input
                name="name"
                defaultValue={plan.name}
                maxLength={80}
                aria-label="Plan name"
                className={fieldClass}
              />
              <textarea
                name="note"
                defaultValue={plan.note ?? ''}
                maxLength={400}
                rows={2}
                placeholder="How to run it — swaps, timing, anything they should know"
                aria-label="Plan note"
                className="w-full resize-y rounded-none border border-input bg-secondary/40 px-2 py-1.5 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none"
              />
              <Button type="submit" size="sm" variant="ghost" className="self-start">
                Save
              </Button>
            </form>

            {plan.bySlot.map((group) => (
              <div key={group.slot} className="flex flex-col gap-1">
                <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                  {group.slot}
                </span>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 py-1.5 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-sm">{item.name}</span>
                      <span className="readout shrink-0 text-[10px] text-muted-foreground">
                        {item.calories} cal · {item.protein}p · {item.carbs}c · {item.fat}f
                      </span>
                      <form action={removePlanItem} className="flex shrink-0">
                        <input type="hidden" name="itemId" value={item.id} />
                        <button
                          type="submit"
                          aria-label={`Remove ${item.name}`}
                          className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                        >
                          <X size={13} />
                        </button>
                      </form>
                    </li>
                  ))}
                </ul>
              </div>
            ))}

            <div className="flex flex-col gap-2 border-t border-border/60 pt-3">
              <p className="readout text-[11px] uppercase text-muted-foreground">
                Day totals{' '}
                <span className="text-foreground">
                  {plan.totals.calories} cal · {plan.totals.protein}p · {plan.totals.carbs}c ·{' '}
                  {plan.totals.fat}f
                </span>
              </p>

              {check && (check.calorieOff || check.proteinOff) ? (
                <p className="text-xs leading-relaxed text-destructive">
                  Against their target this day is{' '}
                  {check.calorieOff && (
                    <>
                      {Math.abs(check.calorieGap)} calories{' '}
                      {check.calorieGap > 0 ? 'over' : 'under'}
                    </>
                  )}
                  {check.calorieOff && check.proteinOff && ' and '}
                  {check.proteinOff && (
                    <>
                      {Math.abs(check.proteinGap)}g protein{' '}
                      {check.proteinGap > 0 ? 'over' : 'under'}
                    </>
                  )}
                  .
                </p>
              ) : check ? (
                <p className="text-xs text-success">Lines up with their target.</p>
              ) : (
                <p className="text-xs text-muted-foreground">
                  No nutrition target set, so there&apos;s nothing to check this against.
                </p>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <form action={publishPlan}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <Button type="submit" size="sm" variant="secondary">
                    <Send size={13} /> Tell them
                  </Button>
                </form>
                <form action={retirePlan}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Retire plan
                  </Button>
                </form>
              </div>
            </div>
          </>
        )}

        {/*
          One form for both ways of adding a line. Picking a recipe fills the
          macros from the library so he isn't retyping numbers he already
          entered; leaving it on "Type it in" uses the fields underneath.
        */}
        <form action={addPlanItem} className="flex flex-col gap-2 border-t border-border/60 pt-3">
          <input type="hidden" name="clientId" value={clientId} />
          <div className="flex flex-wrap items-center gap-2">
            <select name="meal" defaultValue="breakfast" aria-label="Meal" className={selectClass}>
              {MEAL_SLOTS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
            <select name="recipeId" defaultValue="" aria-label="Recipe" className={selectClass}>
              <option value="">Type it in</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
            <input
              type="number"
              name="quantity"
              step="0.25"
              min="0.25"
              defaultValue="1"
              aria-label="Servings"
              className={`readout w-20 ${fieldClass}`}
            />
          </div>

          <input name="name" maxLength={120} placeholder="Name (or leave blank for the recipe's)" className={fieldClass} />

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { n: 'calories', l: 'Cal' },
              { n: 'protein', l: 'Protein' },
              { n: 'carbs', l: 'Carbs' },
              { n: 'fat', l: 'Fat' },
            ].map((f) => (
              <label key={f.n} className="flex min-w-0 flex-col gap-1">
                <span className="readout text-[10px] uppercase text-muted-foreground">{f.l}</span>
                <input
                  type="number"
                  name={f.n}
                  min="0"
                  step="1"
                  defaultValue={0}
                  className={`readout w-full ${fieldClass}`}
                />
              </label>
            ))}
          </div>

          <input name="note" maxLength={200} placeholder="Note for this line (optional)" className={fieldClass} />

          <Button type="submit" size="sm" variant="secondary" className="self-start">
            Add line
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
