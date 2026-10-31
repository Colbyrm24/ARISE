'use client';

import { useFormStatus } from 'react-dom';
import { CalendarDays, Footprints, Moon } from 'lucide-react';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/*
  The weekly pattern. Putting clients on the program is Add subscribers, in
  program-subscribers.tsx.

  This is the screen the whole programming side exists for. A coach lays out
  seven days once — a session here, cardio there, rest on Thursday and Sunday
  — and then never touches a calendar again. Deploying writes real dated rows
  onto one client, so a six-month block is one form submit rather than 180.

  Each day is its own small form on purpose. A coach edits Thursday, presses
  save on Thursday, and nothing else on the page moves. One giant form would
  mean an accidental change to Monday rides along with it.
*/

const DAYS = [
  { n: 1, short: 'Mon', long: 'Monday' },
  { n: 2, short: 'Tue', long: 'Tuesday' },
  { n: 3, short: 'Wed', long: 'Wednesday' },
  { n: 4, short: 'Thu', long: 'Thursday' },
  { n: 5, short: 'Fri', long: 'Friday' },
  { n: 6, short: 'Sat', long: 'Saturday' },
  { n: 7, short: 'Sun', long: 'Sunday' },
];

const selectClass =
  'flex h-10 w-full border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const inputClass = selectClass;

export type WeekDay = {
  weekday: number;
  kind: string;
  workoutId: string | null;
  label: string | null;
  cardioTypeId: string | null;
  cardioMinutes: number | null;
  stepTarget: number | null;
};

export type Named = { id: string; name: string };

function SaveButton({ label = 'Save' }: { label?: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="outline" disabled={pending} className="w-full">
      {pending ? 'Saving…' : label}
    </Button>
  );
}

export function ProgramWeek({
  templateId,
  days,
  workouts,
  cardioTypes,
  setProgramDay,
  setWeekSteps,
  onCalendar,
}: {
  templateId: string;
  days: WeekDay[];
  workouts: Named[];
  cardioTypes: Named[];
  setProgramDay: (formData: FormData) => void;
  setWeekSteps: (formData: FormData) => void;
  /** The program has calendar items, so it deploys from those instead. */
  onCalendar: boolean;
}) {
  const byDay = new Map(days.map((d) => [d.weekday, d]));
  const restCount = days.filter((d) => d.kind === 'rest').length;
  const workCount = days.filter((d) => d.kind === 'workout').length;

  return (
    <div className="flex flex-col gap-6">
      <SystemWindow title="Weekly pattern" meta={`[${workCount} on / ${restCount} off]`}>
        <SystemWindowContent className="flex flex-col gap-5">
          {/*
            The original way to describe a program, kept because Follow My
            Split and every program built before the calendar deploy from it.
            Once a program has anything on its calendar, the calendar is what
            deploys — this box says so rather than letting a coach edit a week
            that no longer does anything.
          */}
          <p className="text-sm text-muted-foreground">
            {onCalendar
              ? 'This program deploys from its calendar now, so this week is only used as a starting point: Calendar → Fill from a weekly pattern copies it into a phase.'
              : 'Describe one week. Until the calendar has anything on it, every week of the program is a copy of this one, so changing Thursday here changes Thursday for the whole block.'}
          </p>

          {/* Steps are the one number that applies to every day including the
              rest days, so it gets its own control rather than being typed
              seven times. */}
          <form action={setWeekSteps} className="flex flex-wrap items-end gap-3 border-b border-border pb-5">
            <input type="hidden" name="templateId" value={templateId} />
            <label className="flex flex-col gap-1.5">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                Steps every day
              </span>
              <input
                name="stepTarget"
                type="number"
                min={1000}
                max={100000}
                step={500}
                defaultValue={byDay.get(1)?.stepTarget ?? 12000}
                className={cn(inputClass, 'w-36')}
              />
            </label>
            <Button type="submit" size="sm" variant="outline">
              <Footprints size={15} />
              Apply to all seven days
            </Button>
          </form>

          <ul className="grid gap-3 lg:grid-cols-2">
            {DAYS.map((d) => {
              const day = byDay.get(d.n);
              const isRest = (day?.kind ?? 'rest') === 'rest';
              return (
                <li key={d.n}>
                  <form
                    action={setProgramDay}
                    className={cn(
                      'flex flex-col gap-3 border p-4 transition-colors',
                      isRest ? 'border-border bg-secondary/20' : 'border-accent/30 bg-accent/[0.04]'
                    )}
                  >
                    <input type="hidden" name="templateId" value={templateId} />
                    <input type="hidden" name="weekday" value={d.n} />

                    <div className="flex items-center justify-between">
                      <span className="readout text-xs uppercase tracking-[0.2em] text-foreground">
                        {d.long}
                      </span>
                      {isRest ? (
                        <Moon size={14} className="text-muted-foreground" />
                      ) : (
                        <CalendarDays size={14} className="glow-ink text-accent" />
                      )}
                    </div>

                    <select name="kind" defaultValue={day?.kind ?? 'rest'} className={selectClass}>
                      <option value="workout">Workout</option>
                      <option value="cardio">Cardio only</option>
                      <option value="rest">Rest day</option>
                    </select>

                    <select
                      name="workoutId"
                      defaultValue={day?.workoutId ?? ''}
                      className={selectClass}
                    >
                      <option value="">— no session —</option>
                      {workouts.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>

                    <div className="grid grid-cols-3 gap-2">
                      <select
                        name="cardioTypeId"
                        defaultValue={day?.cardioTypeId ?? ''}
                        className={selectClass}
                      >
                        <option value="">no cardio</option>
                        {cardioTypes.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      {/*
                        Minutes had no input at all. setProgramDay has always
                        read a `cardioMinutes` field off this form and nothing
                        ever posted one, so Number(null) became 0, the action
                        stored null, and every minutes-based cardio day was
                        impossible to prescribe. The client's screen had
                        nothing to show and nothing to log against.
                      */}
                      <input
                        name="cardioMinutes"
                        type="number"
                        min={0}
                        max={600}
                        step={5}
                        placeholder="Mins"
                        defaultValue={day?.cardioMinutes ?? ''}
                        className={inputClass}
                      />
                      <input
                        name="stepTarget"
                        type="number"
                        min={0}
                        max={100000}
                        step={500}
                        placeholder="Steps"
                        defaultValue={day?.stepTarget ?? ''}
                        className={inputClass}
                      />
                    </div>

                    <SaveButton label={`Save ${d.short}`} />
                  </form>
                </li>
              );
            })}
          </ul>
        </SystemWindowContent>
      </SystemWindow>

    </div>
  );
}
