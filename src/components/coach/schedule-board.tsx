'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, GripVertical, X } from 'lucide-react';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { WEEKDAYS } from '@/lib/month-grid';
import { planMove } from '@/lib/schedule-move';

/*
  A client's month you can rearrange, the way Trainerize does it.

  Drag a session onto another day and it moves there; if that day already had
  something planned, the two days trade places, so a day never ends up with
  two sessions and the client's Today screen never shows the wrong one. On a
  phone or tablet, where dragging inside a page fights the scroll, the same
  thing is two taps: tap the session, tap the day.

  Tapping a day on its own opens the day's tools underneath the grid: take a
  session off, turn the day into a different workout or a rest day, or push
  everything from that day onward back — the button for "they were sick on
  Tuesday".

  Every edit is shown immediately and then saved. If the save is refused, the
  calendar snaps back and says why, rather than leaving the coach looking at a
  month that is not what the client sees.
*/

export type BoardDay = {
  key: string; // YYYY-MM-DD
  dayOfMonth: number;
  outside: boolean;
  today: boolean;
  food?: string;
  weight?: string;
};

export type BoardItem = {
  id: string;
  date: string; // YYYY-MM-DD
  kind: string;
  label: string;
  done: boolean;
};

type Result = { ok: boolean; message?: string };

type Props = {
  clientId: string;
  days: BoardDay[];
  items: BoardItem[];
  workouts: { id: string; name: string }[];
  moveSession: (clientId: string, itemId: string, to: string) => Promise<Result>;
  removeSession: (clientId: string, itemId: string) => Promise<Result>;
  setDaySession: (clientId: string, day: string, workoutId: string | null) => Promise<Result>;
  pushBack: (clientId: string, from: string, days: number) => Promise<Result>;
};

const selectClass =
  'flex h-10 w-full border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function longDate(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

export function ScheduleBoard({
  clientId,
  days,
  items: serverItems,
  workouts,
  moveSession,
  removeSession,
  setDaySession,
  pushBack,
}: Props) {
  const router = useRouter();
  const [items, setItems] = useState(serverItems);
  const [picked, setPicked] = useState<string | null>(null); // tap-to-move
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [dayChoice, setDayChoice] = useState('');
  const [shiftDays, setShiftDays] = useState('1');

  // A refresh after a save hands down the server's truth; take it.
  useEffect(() => setItems(serverItems), [serverItems]);

  const byDay = new Map<string, BoardItem[]>();
  for (const it of items) {
    const list = byDay.get(it.date) ?? [];
    list.push(it);
    byDay.set(it.date, list);
  }

  const pickedItem = picked ? items.find((i) => i.id === picked) ?? null : null;

  /** Show it now, save it, and put it back if the save is refused. */
  function commit(next: BoardItem[] | null, save: () => Promise<Result>) {
    const before = items;
    if (next) setItems(next);
    setNotice(null);
    startTransition(async () => {
      const res = await save();
      if (!res.ok) {
        setItems(before);
        setNotice({ ok: false, text: res.message ?? 'That did not save.' });
        return;
      }
      if (res.message) setNotice({ ok: true, text: res.message });
      router.refresh();
    });
  }

  function move(itemId: string, to: string) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const target = (byDay.get(to) ?? []).map((i) => ({ ...i, completed: i.done }));
    const plan = planMove({ ...item, completed: item.done }, to, target);
    if (!plan.ok) {
      setNotice({ ok: false, text: plan.reason });
      return;
    }
    if (plan.moves.length === 0) return;
    const dest = new Map(plan.moves.map((m) => [m.id, m.date]));
    const next = items.map((i) => (dest.has(i.id) ? { ...i, date: dest.get(i.id)! } : i));
    commit(next, () => moveSession(clientId, itemId, to));
  }

  function onDayClick(key: string) {
    if (picked) {
      move(picked, key);
      setPicked(null);
      return;
    }
    setOpenDay((cur) => (cur === key ? null : key));
    setDayChoice('');
  }

  const openItems = openDay ? byDay.get(openDay) ?? [] : [];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Drag a session to another day — or tap it, then tap the day. If that day already has
        something on it, the two swap. Tap a day for more.
      </p>

      {pickedItem && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 border border-accent/60 bg-background/95 px-3 py-2 text-sm backdrop-blur">
          <span>
            Moving <span className="font-medium text-accent">{pickedItem.label}</span> — tap the day it
            should go on.
          </span>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            Cancel
          </button>
        </div>
      )}

      {notice && (
        <p
          role="status"
          className={cn(
            'readout border px-3 py-2 text-xs',
            notice.ok
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          )}
        >
          {notice.text}
        </p>
      )}

      <SystemWindow plain>
        <SystemWindowContent className={cn('p-0 transition-opacity', pending && 'opacity-80')}>
          <div className="grid grid-cols-7 border-b border-border/60">
            {WEEKDAYS.map((d) => (
              <div
                key={d}
                className="readout px-1 py-2 text-center text-[10px] uppercase text-muted-foreground"
              >
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7">
            {days.map((day) => {
              const sessions = byDay.get(day.key) ?? [];
              const isOver = over === day.key && (dragging || picked);
              return (
                <div
                  key={day.key}
                  role="button"
                  tabIndex={0}
                  aria-label={longDate(day.key)}
                  onClick={() => onDayClick(day.key)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      onDayClick(day.key);
                    }
                  }}
                  onDragOver={(e) => {
                    if (!dragging) return;
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'move';
                    if (over !== day.key) setOver(day.key);
                  }}
                  onDragLeave={() => setOver((cur) => (cur === day.key ? null : cur))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const id = e.dataTransfer.getData('text/plain') || dragging;
                    setOver(null);
                    setDragging(null);
                    if (id) move(id, day.key);
                  }}
                  className={cn(
                    'min-h-[92px] cursor-pointer border-b border-r border-border/40 p-1 outline-none transition-colors sm:min-h-[104px] sm:p-1.5',
                    day.outside && 'opacity-40',
                    day.today && 'bg-accent/[0.07]',
                    openDay === day.key && 'ring-1 ring-inset ring-accent/70',
                    picked && 'hover:bg-accent/[0.08]',
                    isOver && 'bg-accent/15 ring-1 ring-inset ring-accent',
                    'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent'
                  )}
                >
                  <div className="mb-1 flex justify-end">
                    <span
                      className={cn(
                        'readout text-[11px] tabular-nums',
                        day.today ? 'text-accent' : 'text-muted-foreground'
                      )}
                    >
                      {day.dayOfMonth}
                    </span>
                  </div>

                  <div className="flex flex-col gap-1">
                    {sessions.map((s) => (
                      <span
                        key={s.id}
                        title={s.done ? `${s.label} — done` : `${s.label} — drag to move`}
                        draggable={!s.done}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', s.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragging(s.id);
                          setPicked(null);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                        onClick={(e) => {
                          // A finished session can't move, so tapping it just
                          // opens its day like tapping the square would.
                          if (s.done) return;
                          e.stopPropagation();
                          // Mid-move, tapping another day's session means
                          // "this day" — the swap — not "move this one instead".
                          if (picked && picked !== s.id) {
                            move(picked, s.date);
                            setPicked(null);
                            return;
                          }
                          setOpenDay(null);
                          setPicked((cur) => (cur === s.id ? null : s.id));
                        }}
                        className={cn(
                          // Phones get the label over up to three lines rather
                          // than "Uppe…" in every square; wider screens fit it
                          // on one.
                          'flex items-start gap-0.5 border px-1 py-0.5 text-[9px] leading-tight sm:items-center sm:text-[10px]',
                          !s.done && 'cursor-grab active:cursor-grabbing',
                          s.kind === 'rest'
                            ? 'border-border/50 text-muted-foreground'
                            : s.done
                              ? 'border-accent/60 bg-accent/15 text-foreground'
                              : 'border-border/60 text-foreground/85',
                          picked === s.id && 'border-accent bg-accent/25 text-foreground',
                          dragging === s.id && 'opacity-40'
                        )}
                      >
                        {s.done ? (
                          <Check size={9} className="hidden shrink-0 text-accent sm:block" />
                        ) : (
                          <GripVertical size={9} className="hidden shrink-0 opacity-50 sm:block" />
                        )}
                        <span className="line-clamp-3 break-words sm:line-clamp-1 sm:truncate">{s.label}</span>
                      </span>
                    ))}

                    {day.food && (
                      <span className="readout block truncate text-[10px] text-muted-foreground">
                        {day.food}
                      </span>
                    )}
                    {day.weight && (
                      <span className="readout block truncate text-[10px] text-accent/80">{day.weight}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </SystemWindowContent>
      </SystemWindow>

      {openDay && (
        <SystemWindow
          title={longDate(openDay)}
          meta={
            <button
              type="button"
              aria-label="Close"
              onClick={() => setOpenDay(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          }
        >
          <SystemWindowContent className="flex flex-col gap-5">
            <div className="flex flex-col gap-2">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                On this day
              </span>
              {openItems.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nothing planned.</p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {openItems.map((s) => (
                    <li key={s.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex items-center gap-2">
                        {s.done && <Check size={13} className="text-accent" />}
                        {s.label}
                        {s.done && <span className="text-xs text-muted-foreground">· done</span>}
                      </span>
                      {!s.done && (
                        <span className="flex items-center gap-3">
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() => {
                              setPicked(s.id);
                              setOpenDay(null);
                            }}
                            className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                          >
                            Move <ArrowRight size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={pending}
                            onClick={() =>
                              commit(
                                items.filter((i) => i.id !== s.id),
                                () => removeSession(clientId, s.id)
                              )
                            }
                            className="text-xs text-muted-foreground hover:text-destructive"
                          >
                            Remove
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                Make this day
              </span>
              <div className="flex gap-2">
                <select
                  value={dayChoice}
                  onChange={(e) => setDayChoice(e.target.value)}
                  className={selectClass}
                >
                  <option value="">— pick —</option>
                  {workouts.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name}
                    </option>
                  ))}
                  <option value="__rest">Rest day</option>
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={!dayChoice || pending}
                  onClick={() => {
                    const day = openDay;
                    const workoutId = dayChoice === '__rest' ? null : dayChoice;
                    const label = workoutId
                      ? workouts.find((w) => w.id === workoutId)?.name ?? 'Workout'
                      : 'Rest day';
                    const next = [
                      ...items.filter((i) => !(i.date === day && !i.done)),
                      {
                        id: `pending-${day}`,
                        date: day,
                        kind: workoutId ? 'workout' : 'rest',
                        label,
                        done: false,
                      },
                    ];
                    commit(next, () => setDaySession(clientId, day, workoutId));
                    setDayChoice('');
                  }}
                >
                  Set
                </Button>
              </div>
              {workouts.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Workouts appear here once they&apos;re on a program.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                Missed a day?
              </span>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm">Push everything from this day back</span>
                <select
                  value={shiftDays}
                  onChange={(e) => setShiftDays(e.target.value)}
                  className={cn(selectClass, 'w-28')}
                >
                  {[1, 2, 3, 4, 5, 6, 7, 14].map((n) => (
                    <option key={n} value={n}>
                      {n} day{n === 1 ? '' : 's'}
                    </option>
                  ))}
                </select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    const day = openDay;
                    const n = Number(shiftDays);
                    const next = items.map((i) => {
                      if (i.done || i.date < day) return i;
                      const d = new Date(`${i.date}T00:00:00Z`);
                      d.setUTCDate(d.getUTCDate() + n);
                      return { ...i, date: d.toISOString().slice(0, 10) };
                    });
                    commit(next, () => pushBack(clientId, day, n));
                  }}
                >
                  Push back
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Keeps the program in order. Finished sessions stay on the day they were done.
              </p>
            </div>
          </SystemWindowContent>
        </SystemWindow>
      )}
    </div>
  );
}
