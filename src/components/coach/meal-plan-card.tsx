import { X, Send, CalendarRange, Copy, Scaling } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { getActivePlan, planVsTarget, MEAL_SLOTS } from '@/lib/meal-plans';
import { formatRange } from '@/lib/nutrition-day';
import {
  addPlanItem,
  removePlanItem,
  updatePlan,
  publishPlan,
  retirePlan,
  assignStandardPlan,
  copyPlanFrom,
  resizePlanToTarget,
} from '@/app/coach/clients/[id]/plan-actions';
import { copySourcesFor, currentCalories } from '@/lib/client-setup';
import { requireCoach } from '@/lib/auth';
import { servingsLabel } from '@/lib/plan-scale';

/*
  Where the coach writes a client's day.

  The check against their target is the part that earns this card's place. A
  plan whose every option comes to 2,850 against a 3,200 target is a stall
  nobody diagnoses for a month, because nothing else on any screen does that
  arithmetic.

  The lines under a meal are OPTIONS — seven breakfasts is a choice of seven,
  not a breakfast of seven. This card used to add them all together, so a
  perfectly ordinary plan announced "18,485 cal" and "16,285 calories over
  target" in red. A meal is now shown as its cheapest-to-dearest range, the
  day as what one pick per meal can come to, and the verdict asks whether the
  target is reachable rather than what the lines sum to.
*/

const selectClass =
  'h-10 rounded-none border border-input bg-secondary/40 px-2 text-sm capitalize focus-visible:border-accent/60 focus-visible:outline-none';
const fieldClass =
  'h-10 min-w-0 rounded-none border border-input bg-secondary/40 px-2 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none';

export async function CoachMealPlanCard({ clientId }: { clientId: string }) {
  const coach = await requireCoach();
  const plan = await getActivePlan(clientId);
  const [recipes, check, sources, calories] = await Promise.all([
    prisma.recipe.findMany({ orderBy: { title: 'asc' }, take: 200 }),
    plan ? planVsTarget(clientId, plan.dayRange) : Promise.resolve(null),
    copySourcesFor(coach.id, clientId),
    currentCalories(clientId),
  ]);

  // Reusing a plan: pick a client whose plan suits this one, and it comes
  // over resized to this client's calories.
  const copyForm =
    sources.length > 0 ? (
      <form action={copyPlanFrom} className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <input type="hidden" name="clientId" value={clientId} />
        <select name="fromClientId" required defaultValue="" aria-label="Copy plan from" className={`${fieldClass} sm:flex-1`}>
          <option value="" disabled>
            {plan ? "Replace with another client's plan…" : "Copy another client's plan…"}
          </option>
          {sources.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm" variant="outline">
          <Copy size={14} /> Copy, sized to them
        </Button>
      </form>
    ) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Meal plan</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {!plan ? (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-foreground/75">
              None yet. Fastest: the standard plan or a copy of another client's, both sized to
              their calories. Or add lines by hand below and the plan is created with it — it shows on their
              nutrition screen above everything else, so they open the app to a day rather than a
              search box.
            </p>
            {/*
              Or skip all of that. Typing every option by hand is the long way
              round to the answer that is right most of the time, which is
              "put them on the standard plan and adjust from there".
            */}
            <form action={assignStandardPlan}>
              <input type="hidden" name="clientId" value={clientId} />
              <Button type="submit" size="sm" className="w-full sm:w-auto">
                <CalendarRange size={14} /> Standard plan, sized to {calories ? `${calories.toLocaleString('en-US')} cal` : 'them'}
              </Button>
            </form>
            <p className="text-sm text-foreground/70">
              3 meals · 7 options each{calories ? '' : ' · ~2,600 cal until you set their calories'}
            </p>
            {copyForm}
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
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-sm font-bold uppercase tracking-wider text-accent">
                    {group.slot}
                    {group.items.length > 1 && (
                      <span className="ml-2 font-normal normal-case tracking-normal text-foreground/70">
                        {group.items.length} options
                      </span>
                    )}
                  </span>
                  <span className="text-xs text-foreground/70">
                    {formatRange(group.calories)} cal · {formatRange(group.protein)}p
                  </span>
                </div>
                <ul className="flex flex-col">
                  {group.items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 py-1.5 last:border-b-0"
                    >
                      <span className="min-w-0 flex-1 text-sm font-medium text-foreground">
                        {item.name}
                        {item.quantity !== 1 && (
                          <span className="ml-2 text-xs font-semibold text-accent">{servingsLabel(item.quantity)}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-xs text-foreground/70">
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
              {/* "One pick per meal", not a sum. The distinction is the whole
                  fix — see the header. */}
              <p className="text-sm font-semibold uppercase text-foreground/80">
                One of each{' '}
                <span className="text-foreground">
                  {formatRange(plan.dayRange.calories)} cal ·{' '}
                  {formatRange(plan.dayRange.protein)}p · {formatRange(plan.dayRange.carbs)}c ·{' '}
                  {formatRange(plan.dayRange.fat)}f
                </span>
              </p>

              {check &&
              (check.calories.kind !== 'covers' || check.protein.kind !== 'covers') ? (
                <p className="text-sm font-semibold leading-relaxed text-destructive">
                  Whatever they pick off this plan, the day comes in{' '}
                  {check.calories.kind !== 'covers' && (
                    <>
                      {check.calories.by} calories {check.calories.kind}
                    </>
                  )}
                  {check.calories.kind !== 'covers' && check.protein.kind !== 'covers' && ' and '}
                  {check.protein.kind !== 'covers' && (
                    <>
                      {check.protein.by}g protein {check.protein.kind}
                    </>
                  )}
                  .
                </p>
              ) : check ? (
                <p className="text-sm font-semibold text-success">
                  They can hit their target off this plan.
                </p>
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
                {check && (check.calories.kind !== 'covers') && (
                  <form action={resizePlanToTarget}>
                    <input type="hidden" name="clientId" value={clientId} />
                    <Button type="submit" size="sm">
                      <Scaling size={13} /> Resize to their calories
                    </Button>
                  </form>
                )}
                <form action={retirePlan}>
                  <input type="hidden" name="planId" value={plan.id} />
                  <Button type="submit" size="sm" variant="ghost">
                    Retire plan
                  </Button>
                </form>
              </div>
              {copyForm}
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
                <span className="text-sm font-semibold text-foreground">{f.l}</span>
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
