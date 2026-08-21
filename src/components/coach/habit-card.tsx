import { Flame, X } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { HABIT_TYPES, HABIT_META, habitLabel, isTracked, streakFrom } from '@/lib/habits';
import { addHabit, retireHabit, setSteps } from '@/app/coach/clients/[id]/habit-actions';

/*
  Where the coach sets a client's daily habits.

  It reports a streak next to each one, because the streak is the only number
  here that says anything a coach can act on. "Water: 14 days" and "Water: 1
  day" are the same habit and completely different conversations, and the
  second one is the one worth a text.
*/

const STREAK_WINDOW_DAYS = 60;

export async function HabitCard({ clientId }: { clientId: string }) {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  since.setDate(since.getDate() - STREAK_WINDOW_DAYS);

  const [habits, logs, todaySteps] = await Promise.all([
    prisma.dailyGoal.findMany({
      where: { clientId, active: true },
      orderBy: { createdAt: 'asc' },
    }),
    // Completions only. A row that exists but is false is an untick, and
    // counting it would keep a broken streak alive.
    prisma.dailyGoalLog.findMany({
      where: { clientId, completed: true, date: { gte: since } },
      select: { dailyGoalId: true, date: true },
    }),
    prisma.stepLog.findFirst({ where: { clientId }, orderBy: { date: 'desc' } }),
  ]);

  const byHabit = new Map<string, Set<string>>();
  for (const log of logs) {
    const key = log.date.toISOString().slice(0, 10);
    const set = byHabit.get(log.dailyGoalId) ?? new Set<string>();
    set.add(key);
    byHabit.set(log.dailyGoalId, set);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily habits</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {habits.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            None set. These are the rows on their Today screen — without one, that screen is
            empty.
          </p>
        ) : (
          <ul className="flex flex-col">
            {habits.map((habit) => {
              const streak = streakFrom(byHabit.get(habit.id) ?? new Set());
              return (
                <li
                  key={habit.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/50 py-2 last:border-b-0"
                >
                  <span className="min-w-0 flex-1 text-sm">
                    {habitLabel(habit.goalType, habit.targetValue)}
                    {habit.goalType !== 'custom' && habit.targetValue && (
                      <span className="readout ml-2 text-[10px] uppercase text-muted-foreground">
                        {habit.targetValue}
                      </span>
                    )}
                  </span>

                  {isTracked(habit.goalType) ? (
                    <span className="readout text-[10px] uppercase text-muted-foreground">
                      tracked
                    </span>
                  ) : streak > 0 ? (
                    <span className="readout flex items-center gap-1 text-[10px] uppercase text-success">
                      <Flame size={11} /> {streak}d
                    </span>
                  ) : (
                    <span className="readout text-[10px] uppercase text-muted-foreground">
                      no streak
                    </span>
                  )}

                  <form action={retireHabit} className="flex shrink-0">
                    <input type="hidden" name="goalId" value={habit.id} />
                    <button
                      type="submit"
                      aria-label="Retire habit"
                      className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X size={14} />
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        )}

        <form action={addHabit} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="clientId" value={clientId} />
          <select
            name="goalType"
            defaultValue="water"
            aria-label="Habit"
            className="readout h-9 rounded-none border border-input bg-secondary/40 px-2 text-[11px] uppercase tracking-wider focus-visible:border-accent/60 focus-visible:outline-none"
          >
            {HABIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {HABIT_META[t].label}
              </option>
            ))}
          </select>
          <input
            name="targetValue"
            maxLength={80}
            placeholder="Target, or what to do"
            aria-label="Target"
            className="h-9 min-w-0 flex-1 rounded-none border border-input bg-secondary/40 px-2 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none"
          />
          <Button type="submit" size="sm" variant="secondary">
            Add
          </Button>
        </form>

        {/*
          Steps get their own entry because the coach hears them over text all
          day ("8-10k") and had nowhere to put the number. Without a write path
          a steps habit could be set and never completed.
        */}
        <form action={setSteps} className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-3">
          <input type="hidden" name="clientId" value={clientId} />
          <span className="readout text-[10px] uppercase text-muted-foreground">Steps today</span>
          <input
            type="number"
            name="steps"
            min="0"
            step="1"
            inputMode="numeric"
            placeholder={todaySteps ? String(todaySteps.steps) : '10000'}
            aria-label="Steps today"
            className="readout h-9 w-28 rounded-none border border-input bg-secondary/40 px-2 text-sm focus-visible:border-accent/60 focus-visible:outline-none"
          />
          <Button type="submit" size="sm" variant="outline">
            Log
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
