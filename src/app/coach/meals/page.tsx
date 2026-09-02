import { AlertTriangle, Check, Send, Trash2 } from 'lucide-react';
import { requireCoach } from '@/lib/auth';
import {
  getPendingMeals,
  getReadAccuracy,
  countPendingMeals,
  type PendingMeal,
} from '@/lib/meal-review';
import { SystemWindow, SystemWindowContent, Count } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { macroReply, askIfThatsAll } from '@/lib/meal-reply';
import type { DayContext } from '@/lib/day-shape';
import { cn } from '@/lib/utils';
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

/*
  The day around the plate.

  Without this the coach reads a number off the card and then has to open the
  client's profile to find out whether the number is good — at which point the
  queue is slower than the text thread it replaced. Four bars and one sentence
  is the whole of it: enough to answer "is this fine" without becoming a
  second dashboard sitting inside the queue.
*/
/*
  The flag carries the judgment; the bars underneath carry the numbers.

  An earlier version spelled the figures out here too — "Barely eaten today —
  830 of 2,200" sitting directly above a bar reading 830/2,200. Saying it
  twice made the strip wrap on a phone and told the coach nothing extra, so
  the only flag that quotes a number is the one whose number isn't on a bar.
*/
const FLAG_COPY: Record<
  NonNullable<DayContext['flag']>,
  (d: DayContext) => { text: string; tone: string }
> = {
  under: () => ({ text: 'Barely eaten today', tone: 'text-destructive' }),
  over: (d) => ({
    // The overage isn't readable off a bar that's simply full.
    text: `${Math.abs(d.left!.calories).toLocaleString()} over the ceiling`,
    tone: 'text-destructive',
  }),
  fat_spent: () => ({ text: 'Fat is spent — keep the rest lean', tone: 'text-accent' }),
  protein_behind: () => ({ text: 'Protein behind the calories', tone: 'text-accent' }),
  easy_close: (d) => ({
    // Likewise: "what's left" is the subtraction the coach would do himself.
    text: `${d.left!.calories.toLocaleString()} left · ${d.left!.protein}g protein to go`,
    tone: 'text-success',
  }),
};

function DayBar({ label, value, target }: { label: string; value: number; target: number }) {
  // Capped at 100 for the fill but not for the reading, so going over shows
  // as a full bar with a number that tells the truth.
  const pct = target > 0 ? Math.min(100, (value / target) * 100) : 0;
  const over = target > 0 && value > target;

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <div className="flex items-baseline justify-between gap-1">
        <span className="readout text-[10px] uppercase text-muted-foreground">{label}</span>
        <span className={`readout text-[10px] ${over ? 'text-destructive' : ''}`}>
          {value.toLocaleString()}
          <span className="text-muted-foreground">/{target.toLocaleString()}</span>
        </span>
      </div>
      <div className="h-1 w-full bg-secondary">
        <div
          className={`h-full ${over ? 'bg-destructive' : 'bg-accent'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

function DayStrip({ day }: { day: DayContext }) {
  if (!day.target) return null;
  const flag = day.flag ? FLAG_COPY[day.flag](day) : null;

  return (
    <div className="flex flex-col gap-2 border border-border/60 bg-secondary/20 p-2">
      {/*
        Stacked on a phone. Side by side, a two-word label and a six-word flag
        both wrap and the header turns into four ragged lines above the bars.
      */}
      <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:justify-between sm:gap-2">
        <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
          Day so far · {day.meals} logged
        </span>
        {flag && <span className={`readout text-[10px] ${flag.tone}`}>{flag.text}</span>}
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-4">
        <DayBar label="Cal" value={day.calories} target={day.target.calories} />
        <DayBar label="Protein" value={day.protein} target={day.target.protein} />
        <DayBar label="Carbs" value={day.carbs} target={day.target.carbs} />
        <DayBar label="Fat" value={day.fat} target={day.target.fat} />
      </div>
    </div>
  );
}

function MealCard({ meal }: { meal: PendingMeal }) {
  const est = meal.estimate;

  /*
    Generated once and carried into the form in a hidden field beside the
    textarea, so correctMeal can tell "he left it alone" from "he wrote this"
    by comparing against what was ACTUALLY on screen. Reconstructing it in the
    action meant regenerating from the day as it looks at submit time, which
    drifts the moment the client logs anything while the queue is open — and
    the coach's stale text then went out quoting the numbers he had just
    corrected away from.
  */
  const prefilledReply = macroReply({
    id: meal.id,
    meal: meal.meal,
    calories: meal.calories,
    protein: meal.protein,
    carbs: meal.carbs,
    fat: meal.fat,
    failed: Boolean(meal.failure),
    failureReason: meal.failureReason,
    day: meal.day,
  });
  const followUp = askIfThatsAll(meal.day);

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
            /*
              What to DO about it depends on why it failed, and this said one
              thing for all four reasons.

              The dangerous one is day-summary: a perfectly legible tracker
              home screen the client meant to send. The banner told the coach
              "nothing was counted — put the numbers in below", so typing in
              the 1,807 it was quoting at him wrote a whole day's eating on
              top of the meals already logged that day. That is exactly the
              double-count the day-summary branch exists to prevent, and the
              advice and the safeguard were pointing opposite ways.
            */
            <div
              className={cn(
                'flex items-start gap-2 border p-2',
                meal.failureReason === 'day-summary'
                  ? 'border-accent/40 bg-accent/[0.06]'
                  : 'border-destructive/40 bg-destructive/[0.06]'
              )}
            >
              <AlertTriangle
                size={14}
                className={cn(
                  'mt-0.5 shrink-0',
                  meal.failureReason === 'day-summary' ? 'text-accent' : 'text-destructive'
                )}
              />
              <p className="text-xs leading-relaxed">
                {meal.failure}{' '}
                {meal.failureReason === 'day-summary' ? (
                  <>
                    This is their whole day, not one meal, so nothing was counted — their
                    individual meals are already logged.{' '}
                    <strong className="text-foreground">Don&apos;t put these numbers in below</strong>
                    , it would count the day twice. Reply about it instead.
                    {meal.dayTotals && (
                      <span className="readout mt-1 block text-[10px] uppercase text-muted-foreground">
                        Their screen says {Math.round(meal.dayTotals.calories)} cal ·{' '}
                        {Math.round(meal.dayTotals.protein)}p ·{' '}
                        {Math.round(meal.dayTotals.carbs)}c · {Math.round(meal.dayTotals.fat)}f
                      </span>
                    )}
                  </>
                ) : meal.failureReason === 'unavailable' ? (
                  <>
                    That was the reader failing, not the photo — the client did nothing wrong.
                    Nothing was counted; put the numbers in below if you can read it yourself.
                  </>
                ) : meal.failureReason === 'not-food' ? (
                  <>Nothing was counted. Worth asking what they meant to send.</>
                ) : (
                  <>Nothing was counted against their day — put the numbers in below.</>
                )}
              </p>
            </div>
          ) : (
            est && (
              <>
                <div>
                  <p className="text-sm font-medium">{est.name}</p>
                  {/*
                    A transcription and an estimate are different claims, and
                    the coach checks them differently. "High confidence" on a
                    screenshot reads as the model being sure of its guess; it
                    is actually the app's own printed figures, which is a much
                    stronger thing and takes about a second to verify.
                  */}
                  <p
                    className={`readout mt-0.5 text-[10px] uppercase ${
                      est.source === 'screen' ? 'text-accent' : CONFIDENCE_TONE[est.confidence]
                    }`}
                  >
                    {est.source === 'screen'
                      ? 'read off their tracker'
                      : `${est.confidence} confidence`}
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

          {meal.day && <DayStrip day={meal.day} />}

          {/*
            One form now, with two submit buttons pointing at different
            actions.

            It used to be two forms so that confirming stayed a single tap.
            That still holds — formAction keeps it one tap — but sharing a form
            means the reply below can be sent by either path. Two forms would
            have meant two reply boxes, or a reply attached to only one of them.
          */}
          <form action={correctMeal} className="flex flex-col gap-3 border-t border-border/60 pt-3">
            <input type="hidden" name="logId" value={meal.id} />
            {/* What the textarea was filled with — see correctMeal. */}
            <input type="hidden" name="replyWas" value={prefilledReply} />
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
            {/*
              The reply, written for him and editable in place.

              This is the part that replaces the actual job: confirming a photo
              never took the time, opening Messages and typing the same shape of
              sentence forty times a day did. Sent from his own account into the
              normal thread, so the client can reply to it like anything else.

              Leave it untouched and it stays in step with whatever numbers get
              submitted. Clear it and nothing sends.
            */}
            <label className="flex flex-col gap-1.5">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                Reply to {meal.clientName.split(' ')[0]}
              </span>
              <textarea
                name="reply"
                rows={4}
                maxLength={2000}
                defaultValue={prefilledReply}
                className="w-full resize-y rounded-none border border-input bg-secondary/40 p-2 text-sm leading-relaxed focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50"
              />
            </label>

            {/*
              "Was that everything?" as a second message rather than a second
              sentence.

              The reply above already spent its one question, and two questions
              in one text is the thing he cuts out of drafts. This only appears
              when the numbers make it a real question — one or two things
              logged, well under the day — so it stays a signal instead of a
              box that's always there.
            */}
            {followUp && (
              <label className="flex items-start gap-2 border border-border/60 bg-secondary/20 p-2">
                <input
                  type="checkbox"
                  name="followUp"
                  value={followUp}
                  defaultChecked
                  className="mt-0.5 shrink-0 accent-[hsl(var(--accent))]"
                />
                <span className="text-xs leading-relaxed">
                  Send <span className="text-muted-foreground">&ldquo;{followUp}&rdquo;</span> after
                </span>
              </label>
            )}

            <div className="flex flex-wrap items-center gap-2">
              {!meal.failure && (
                <Button type="submit" formAction={confirmMeal} size="sm">
                  <Check size={14} /> Numbers are right — send
                </Button>
              )}
              <Button type="submit" size="sm" variant="outline">
                <Send size={14} /> Use my numbers — send
              </Button>
              <Button type="submit" formAction={discardMeal} size="sm" variant="ghost">
                <Trash2 size={14} /> Discard
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default async function CoachMealsPage() {
  const coach = await requireCoach();
  const [meals, accuracy, waiting] = await Promise.all([
    getPendingMeals(coach.id),
    getReadAccuracy(coach.id),
    // The badge in the sidebar counts every pending row; this page renders 40.
    // Without this the two disagreed with nothing to explain the gap.
    countPendingMeals(coach.id).catch(() => 0),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="display text-2xl">Meals</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Photos your clients logged, read and waiting on you.
        </p>
        {/*
          Say so when the page is not the whole queue.

          The list takes 40 oldest-first and the sidebar badge counts all of
          them, so past forty the coach saw a badge reading 137 and a page
          showing 40, with the newest — the clients actively waiting on a
          number right now — structurally unreachable and nothing on screen
          admitting it. Nothing ages these rows out, so the backlog is
          permanent until he clears the front of it.
        */}
        {waiting > meals.length && (
          <p className="readout mt-2 border border-accent/40 bg-accent/[0.06] px-3 py-2 text-[11px] uppercase leading-relaxed text-foreground">
            Showing the {meals.length} oldest of {waiting} waiting. Clear these and the rest move
            up.
          </p>
        )}
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
