import { Check } from 'lucide-react';
import { SystemWindow, SystemWindowContent, Count } from '@/components/ui/system-window';
import type { ClientPlan } from '@/lib/meal-plans';
import { logPlanItem } from '@/app/(client)/nutrition/actions';

/*
  The client's plan, on the screen where they log food.

  Every line logs in one tap. That is the whole reason this is worth building:
  a plan the client has to re-enter by hand is a screenshot, and a screenshot
  is what they already had in their camera roll.

  Lines already eaten today are shown as done rather than hidden. Hiding them
  would make the plan shrink through the day and lose the one thing it is for
  — being able to see, at 4pm, what is still ahead of you.
*/

export function MealPlanCard({
  plan,
  loggedNames,
}: {
  plan: ClientPlan;
  /** Lower-cased names already logged today, used to mark lines done. */
  loggedNames: Set<string>;
}) {
  return (
    <SystemWindow title={plan.name} meta={`[${plan.totals.calories} cal]`}>
      <SystemWindowContent className="flex flex-col gap-4 pt-4">
        {plan.note && (
          <p className="text-sm leading-relaxed text-muted-foreground">{plan.note}</p>
        )}

        {plan.bySlot.map((group) => (
          <div key={group.slot} className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between gap-3">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                {group.slot}
              </span>
              <span className="readout text-[10px] text-muted-foreground">
                {group.calories} cal · {group.protein}p
              </span>
            </div>

            <ul className="flex flex-col">
              {group.items.map((item) => {
                const done = loggedNames.has(item.name.toLowerCase());
                return (
                  <li
                    key={item.id}
                    className="flex flex-col gap-1 border-b border-border/40 py-2 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
                  >
                    <div className="min-w-0">
                      <p className={`text-sm ${done ? 'text-muted-foreground line-through' : ''}`}>
                        {item.name}
                        {item.quantity !== 1 && (
                          <span className="readout ml-2 text-[10px] uppercase text-muted-foreground">
                            ×{item.quantity}
                          </span>
                        )}
                      </p>
                      {item.note && (
                        <p className="mt-0.5 text-xs text-muted-foreground">{item.note}</p>
                      )}
                    </div>

                    <div className="flex shrink-0 items-center gap-3">
                      <span className="readout text-[10px] text-muted-foreground">
                        {item.calories} cal · {item.protein}p · {item.carbs}c · {item.fat}f
                      </span>
                      {done ? (
                        <span className="readout flex items-center gap-1 text-[10px] uppercase text-success">
                          <Check size={12} /> in
                        </span>
                      ) : (
                        <form action={logPlanItem} className="flex">
                          <input type="hidden" name="itemId" value={item.id} />
                          <button
                            type="submit"
                            className="readout border border-border/70 px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent focus-visible:border-accent focus-visible:outline-none"
                          >
                            Log
                          </button>
                        </form>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-border/60 pt-3">
          <span className="readout text-[10px] uppercase text-muted-foreground">Plan day</span>
          <Count value={plan.totals.calories} unit=" cal" />
          <Count value={plan.totals.protein} unit="g protein" />
          <Count value={plan.totals.carbs} unit="g carbs" />
          <Count value={plan.totals.fat} unit="g fat" />
        </div>
      </SystemWindowContent>
    </SystemWindow>
  );
}
