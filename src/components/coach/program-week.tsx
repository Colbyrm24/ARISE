'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { CalendarDays, Footprints, Moon, Rocket } from 'lucide-react';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { DeployState } from '@/app/coach/programs/[id]/actions';

/*
  The week, and the button that turns it into months.

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

function DeployButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full sm:w-auto">
      <Rocket size={15} />
      {pending ? 'Writing the calendar…' : 'Deploy to client'}
    </Button>
  );
}

export function ProgramWeek({
  templateId,
  days,
  workouts,
  cardioTypes,
  clients,
  setProgramDay,
  setWeekSteps,
  deployToClient,
  defaultStart,
}: {
  templateId: string;
  days: WeekDay[];
  workouts: Named[];
  cardioTypes: Named[];
  clients: { id: string; name: string }[];
  setProgramDay: (formData: FormData) => void;
  setWeekSteps: (formData: FormData) => void;
  deployToClient: (prev: DeployState, formData: FormData) => Promise<DeployState>;
  defaultStart: string;
}) {
  const [state, action] = useFormState(deployToClient, { ok: false, message: '' });

  const byDay = new Map(days.map((d) => [d.weekday, d]));
  const restCount = days.filter((d) => d.kind === 'rest').length;
  const workCount = days.filter((d) => d.kind === 'workout').length;

  return (
    <div className="flex flex-col gap-6">
      <SystemWindow title="The week" meta={`[${workCount} on / ${restCount} off]`}>
        <SystemWindowContent className="flex flex-col gap-5">
          <p className="text-sm text-muted-foreground">
            Describe one week. Every week of the program is a copy of it, so changing Thursday here
            changes Thursday for the whole block.
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

      <SystemWindow title="Deploy" meta="[one client]">
        <SystemWindowContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Writes the week across the client&apos;s calendar, one dated row per day. Re-deploying
            replaces only what this program put there, and never touches a day that has already
            passed.
          </p>

          <form action={action} className="flex flex-col gap-3">
            <input type="hidden" name="templateId" value={templateId} />

            <div className="grid gap-3 sm:grid-cols-3">
              <label className="flex flex-col gap-1.5">
                <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                  Client
                </span>
                <select name="clientId" required className={selectClass}>
                  <option value="">— pick a client —</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                  Starts
                </span>
                <input name="startDate" type="date" defaultValue={defaultStart} className={inputClass} />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                  Length
                </span>
                <select name="weeks" defaultValue="26" className={selectClass}>
                  <option value="4">4 weeks</option>
                  <option value="8">8 weeks</option>
                  <option value="12">12 weeks — 3 months</option>
                  <option value="26">26 weeks — 6 months</option>
                  <option value="52">52 weeks — a year</option>
                </select>
              </label>
            </div>

            <DeployButton />
          </form>

          {state.message && (
            <p
              className={cn(
                'readout border px-3 py-2 text-xs',
                state.ok
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-destructive/40 bg-destructive/10 text-destructive'
              )}
            >
              {state.message}
            </p>
          )}
        </SystemWindowContent>
      </SystemWindow>
    </div>
  );
}
