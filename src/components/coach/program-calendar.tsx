'use client';

import { useEffect, useMemo, useState, useTransition, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  Camera,
  ChevronDown,
  ClipboardCheck,
  Copy,
  Dumbbell,
  HeartPulse,
  MessageSquare,
  Moon,
  Pencil,
  Plus,
  Ruler,
  Trash2,
  X,
} from 'lucide-react';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  CALENDAR_KINDS,
  KIND_LABELS,
  orderDayItems,
  phaseForDay,
  weekOf,
  weekdayOf,
  type CalendarKind,
  type ItemInput,
  type PatternEntry,
} from '@/lib/program-calendar';
import type { CalendarResult, RepeatInput } from '@/app/coach/programs/[id]/calendar-actions';

/*
  The program calendar, laid out the way Trainerize's is: a row per week
  (W1, W2, ...), seven numbered days across, no real dates. The first day of
  each phase carries a marker. "Schedule" adds an activity — a workout from
  this program, cardio with a written target, rest, a photos / body stats /
  check-in reminder, or a message — optionally repeated every week on chosen
  days. Click a day to see, edit, move or delete what is on it; drag an item
  to another day; copy a week onto others; or stamp a seven-day pattern
  across a whole phase.

  Drag and drop is native HTML5, and on a phone the same move is two taps
  (Move, then the day), exactly as the client calendar does it — dragging
  inside a scrolling page fights the scroll there.

  Edits show at once and then save; a refused save snaps back and says why.
*/

export type CalItem = {
  id: string;
  dayIndex: number;
  kind: string;
  title: string;
  workoutId: string | null;
  cardioTypeId: string | null;
  cardioMinutes: number | null;
  cardioTarget: string | null;
  stepTarget: number | null;
  label: string | null;
  note: string | null;
  position: number;
};

export type CalPhase = { id: string; name: string; startDay: number; endDay: number };

type Named = { id: string; name: string };

type Props = {
  templateId: string;
  items: CalItem[];
  phases: CalPhase[];
  totalWeeks: number;
  workouts: Named[];
  cardioTypes: Named[];
  /** The old repeating week, as seven slots, to prefill "Fill from a weekly pattern". */
  weekPattern: PatternEntry[][];
  /** Opened from a workout's Schedule link: the Add Activity dialog, preset. */
  initial?: { kind?: string; workoutId?: string } | null;
  addItems: (templateId: string, dayIndex: number, input: ItemInput, repeat?: RepeatInput | null) => Promise<CalendarResult>;
  updateItem: (templateId: string, itemId: string, dayIndex: number, input: ItemInput) => Promise<CalendarResult>;
  deleteItem: (templateId: string, itemId: string) => Promise<CalendarResult>;
  moveItem: (templateId: string, itemId: string, dayIndex: number) => Promise<CalendarResult>;
  copyWeek: (templateId: string, fromWeek: number, toWeeks: number[], replace: boolean) => Promise<CalendarResult>;
  fillPattern: (templateId: string, phaseId: string, pattern: PatternEntry[][], replace: boolean) => Promise<CalendarResult>;
};

type Dialog =
  | { mode: 'add'; dayIndex: number; kind: CalendarKind; workoutId?: string }
  | { mode: 'edit'; item: CalItem }
  | { mode: 'copy'; week: number }
  | { mode: 'fill' };

const selectClass =
  'flex h-10 w-full border border-input bg-secondary/40 px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const labelClass = 'readout text-[10px] uppercase tracking-wider text-muted-foreground';

const KIND_ICON: Record<string, typeof Dumbbell> = {
  workout: Dumbbell,
  cardio: HeartPulse,
  rest: Moon,
  photos: Camera,
  bodystats: Ruler,
  checkin: ClipboardCheck,
  message: MessageSquare,
};

const KIND_CHIP: Record<string, string> = {
  workout: 'border-accent/50 text-foreground',
  cardio: 'border-success/50 text-foreground',
  rest: 'border-border/50 text-muted-foreground',
  photos: 'border-dashed border-border text-muted-foreground',
  bodystats: 'border-dashed border-border text-muted-foreground',
  checkin: 'border-dashed border-border text-muted-foreground',
  message: 'border-accent/30 italic text-muted-foreground',
};

/** The day's place in the program, said the way a coach reads the grid. */
function dayName(dayIndex: number) {
  return `Day ${dayIndex} · W${weekOf(dayIndex)}`;
}

export function ProgramCalendar(props: Props) {
  const { templateId, phases, totalWeeks, workouts, cardioTypes } = props;
  const router = useRouter();
  const [items, setItems] = useState(props.items);
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<number | null>(null);
  const [menu, setMenu] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  // A refresh after a save hands down the server's truth; take it.
  useEffect(() => setItems(props.items), [props.items]);

  // Arrived from a workout's "Schedule" link.
  useEffect(() => {
    if (!props.initial?.kind) return;
    const kind = (CALENDAR_KINDS as readonly string[]).includes(props.initial.kind)
      ? (props.initial.kind as CalendarKind)
      : 'workout';
    setDialog({ mode: 'add', dayIndex: 1, kind, workoutId: props.initial.workoutId });
    // Only on arrival — not every time the server refreshes the props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const byDay = useMemo(() => {
    const map = new Map<number, CalItem[]>();
    for (const it of items) map.set(it.dayIndex, [...(map.get(it.dayIndex) ?? []), it]);
    for (const [k, list] of map) map.set(k, orderDayItems(list));
    return map;
  }, [items]);

  const phaseStarts = new Map(phases.map((p) => [p.startDay, p]));
  const pickedItem = picked ? items.find((i) => i.id === picked) ?? null : null;

  function after(res: CalendarResult, before?: CalItem[]) {
    if (!res.ok) {
      if (before) setItems(before);
      setNotice({ ok: false, text: res.message ?? 'That did not save.' });
      return false;
    }
    if (res.message) setNotice({ ok: true, text: res.message });
    router.refresh();
    return true;
  }

  function move(itemId: string, dayIndex: number) {
    const item = items.find((i) => i.id === itemId);
    if (!item || item.dayIndex === dayIndex) return;
    const before = items;
    setItems(items.map((i) => (i.id === itemId ? { ...i, dayIndex } : i)));
    setNotice(null);
    startTransition(async () => {
      after(await props.moveItem(templateId, itemId, dayIndex), before);
    });
  }

  function remove(itemId: string) {
    const before = items;
    setItems(items.filter((i) => i.id !== itemId));
    setNotice(null);
    startTransition(async () => {
      after(await props.deleteItem(templateId, itemId), before);
    });
  }

  function onDayClick(dayIndex: number) {
    if (picked) {
      move(picked, dayIndex);
      setPicked(null);
      return;
    }
    setOpenDay((cur) => (cur === dayIndex ? null : dayIndex));
  }

  const weeks = Array.from({ length: totalWeeks }, (_, i) => i + 1);
  const openItems = openDay ? byDay.get(openDay) ?? [] : [];
  const openPhase = openDay ? phaseForDay(phases, openDay) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          Day 1 is the client&apos;s start date. Click a day to edit it; drag an item to move it.
        </p>
        <div className="relative">
          <Button type="button" size="sm" onClick={() => setMenu((m) => !m)} aria-expanded={menu}>
            <Plus size={14} />
            Schedule
            <ChevronDown size={13} />
          </Button>
          {menu && (
            <ul
              role="menu"
              className="absolute right-0 z-30 mt-1 w-56 border border-border bg-card py-1 shadow-lg"
            >
              {CALENDAR_KINDS.map((k) => {
                const Icon = KIND_ICON[k];
                return (
                  <li key={k}>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setMenu(false);
                        setDialog({ mode: 'add', dayIndex: openDay ?? 1, kind: k });
                      }}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/[0.08]"
                    >
                      <Icon size={14} className="text-muted-foreground" />
                      {KIND_LABELS[k]}
                    </button>
                  </li>
                );
              })}
              <li className="my-1 border-t border-border/60" />
              <li>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenu(false);
                    setDialog({ mode: 'fill' });
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent/[0.08]"
                >
                  <Copy size={14} className="text-muted-foreground" />
                  Fill from a weekly pattern
                </button>
              </li>
            </ul>
          )}
        </div>
      </div>

      {pickedItem && (
        <div className="sticky top-2 z-20 flex items-center justify-between gap-3 border border-accent/60 bg-background/95 px-3 py-2 text-sm backdrop-blur">
          <span>
            Moving <span className="font-medium text-accent">{pickedItem.title}</span> — tap the day it
            should go on.
          </span>
          <button type="button" onClick={() => setPicked(null)} className="text-xs text-muted-foreground hover:text-foreground">
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
          <div className="grid grid-cols-[26px_repeat(7,minmax(0,1fr))] border-b border-border/60 sm:grid-cols-[40px_repeat(7,minmax(0,1fr))]">
            <div />
            {[1, 2, 3, 4, 5, 6, 7].map((d) => (
              <div key={d} className="readout px-1 py-2 text-center text-[10px] uppercase text-muted-foreground">
                <span className="sm:hidden">{d}</span>
                <span className="hidden sm:inline">Day {d}</span>
              </div>
            ))}
          </div>

          {weeks.map((w) => (
            <div
              key={w}
              className="grid grid-cols-[26px_repeat(7,minmax(0,1fr))] sm:grid-cols-[40px_repeat(7,minmax(0,1fr))]"
            >
              {/* The week label doubles as "copy this week". */}
              <button
                type="button"
                onClick={() => setDialog({ mode: 'copy', week: w })}
                title={`Copy week ${w} to other weeks`}
                className="readout flex items-start justify-center border-b border-r border-border/40 pt-1.5 text-[10px] uppercase text-muted-foreground hover:text-accent"
              >
                W{w}
              </button>
              {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                const dayIndex = (w - 1) * 7 + d;
                const list = byDay.get(dayIndex) ?? [];
                const starts = phaseStarts.get(dayIndex);
                const inPhase = phaseForDay(phases, dayIndex);
                const isOver = over === dayIndex && (dragging || picked);
                return (
                  <div
                    key={d}
                    role="button"
                    tabIndex={0}
                    aria-label={dayName(dayIndex)}
                    onClick={() => onDayClick(dayIndex)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        onDayClick(dayIndex);
                      }
                    }}
                    onDragOver={(e) => {
                      if (!dragging) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (over !== dayIndex) setOver(dayIndex);
                    }}
                    onDragLeave={() => setOver((cur) => (cur === dayIndex ? null : cur))}
                    onDrop={(e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData('text/plain') || dragging;
                      setOver(null);
                      setDragging(null);
                      if (id) move(id, dayIndex);
                    }}
                    className={cn(
                      'min-h-[72px] min-w-0 cursor-pointer border-b border-r border-border/40 p-0.5 outline-none transition-colors sm:min-h-[96px] sm:p-1.5',
                      !inPhase && 'bg-secondary/20',
                      openDay === dayIndex && 'ring-1 ring-inset ring-accent/70',
                      picked && 'hover:bg-accent/[0.08]',
                      isOver && 'bg-accent/15 ring-1 ring-inset ring-accent',
                      'focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent'
                    )}
                  >
                    <div className="mb-1 flex items-start justify-between gap-1">
                      {starts ? (
                        <span
                          title={`${starts.name} starts`}
                          className="readout line-clamp-2 min-w-0 break-words text-[8px] uppercase leading-tight text-accent sm:text-[9px]"
                        >
                          ▸ {starts.name} <span className="hidden sm:inline">starts</span>
                        </span>
                      ) : (
                        <span />
                      )}
                      <span className="readout shrink-0 text-[10px] tabular-nums text-muted-foreground">
                        {dayIndex}
                      </span>
                    </div>
                    <div className="flex flex-col gap-0.5 sm:gap-1">
                      {list.map((it) => {
                        const Icon = KIND_ICON[it.kind] ?? Dumbbell;
                        return (
                          <span
                            key={it.id}
                            title={it.title}
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('text/plain', it.id);
                              e.dataTransfer.effectAllowed = 'move';
                              setDragging(it.id);
                              setPicked(null);
                            }}
                            onDragEnd={() => {
                              setDragging(null);
                              setOver(null);
                            }}
                            className={cn(
                              'flex cursor-grab items-start gap-0.5 border px-0.5 py-0.5 text-[9px] leading-tight active:cursor-grabbing sm:items-center sm:px-1 sm:text-[10px]',
                              KIND_CHIP[it.kind],
                              picked === it.id && 'border-accent bg-accent/25 text-foreground',
                              dragging === it.id && 'opacity-40'
                            )}
                          >
                            <Icon size={9} className="mt-px hidden shrink-0 opacity-70 sm:block" />
                            <span className="line-clamp-3 min-w-0 break-words sm:line-clamp-1 sm:truncate">{it.title}</span>
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </SystemWindowContent>
      </SystemWindow>

      {openDay && (
        <SystemWindow
          title={dayName(openDay)}
          meta={
            <button type="button" aria-label="Close" onClick={() => setOpenDay(null)} className="text-muted-foreground hover:text-foreground">
              <X size={14} />
            </button>
          }
        >
          <SystemWindowContent className="flex flex-col gap-4">
            <p className="text-xs text-muted-foreground">
              Week {weekOf(openDay)}, day {weekdayOf(openDay)}
              {openPhase ? ` · ${openPhase.name}` : ' · after the last phase'}
            </p>
            {openItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing scheduled.</p>
            ) : (
              <ul className="flex flex-col divide-y divide-border/60">
                {openItems.map((it) => {
                  const Icon = KIND_ICON[it.kind] ?? Dumbbell;
                  return (
                    <li key={it.id} className="flex flex-wrap items-start justify-between gap-3 py-2">
                      <span className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                        <Icon size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block">{it.title}</span>
                          {it.cardioTarget && <span className="block text-xs text-muted-foreground">{it.cardioTarget}</span>}
                          {it.note && <span className="block whitespace-pre-line text-xs italic text-muted-foreground">{it.note}</span>}
                        </span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setDialog({ mode: 'edit', item: it })}
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Pencil size={11} /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setPicked(it.id);
                            setOpenDay(null);
                          }}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                        >
                          Move <ArrowRight size={11} />
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => remove(it.id)}
                          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" onClick={() => setDialog({ mode: 'add', dayIndex: openDay, kind: 'workout' })}>
                <Plus size={14} /> Add activity
              </Button>
              <Button type="button" size="sm" variant="outline" onClick={() => setDialog({ mode: 'copy', week: weekOf(openDay) })}>
                <Copy size={14} /> Copy week {weekOf(openDay)}
              </Button>
            </div>
          </SystemWindowContent>
        </SystemWindow>
      )}

      {dialog && (dialog.mode === 'add' || dialog.mode === 'edit') && (
        <ActivityDialog
          key={dialog.mode === 'edit' ? dialog.item.id : `add-${dialog.dayIndex}-${dialog.kind}`}
          dialog={dialog}
          totalDays={totalWeeks * 7}
          phases={phases}
          workouts={workouts}
          cardioTypes={cardioTypes}
          onClose={() => setDialog(null)}
          onSave={async (dayIndex, input, repeat) => {
            const res =
              dialog.mode === 'edit'
                ? await props.updateItem(templateId, dialog.item.id, dayIndex, input)
                : await props.addItems(templateId, dayIndex, input, repeat);
            if (res.ok) {
              setDialog(null);
              setOpenDay(dayIndex);
              after(res);
            }
            return res;
          }}
        />
      )}

      {dialog?.mode === 'copy' && (
        <CopyWeekDialog
          week={dialog.week}
          totalWeeks={totalWeeks}
          onClose={() => setDialog(null)}
          onSave={async (toWeeks, replace) => {
            const res = await props.copyWeek(templateId, dialog.week, toWeeks, replace);
            if (res.ok) {
              setDialog(null);
              after(res);
            }
            return res;
          }}
        />
      )}

      {dialog?.mode === 'fill' && (
        <FillPatternDialog
          phases={phases}
          workouts={workouts}
          cardioTypes={cardioTypes}
          initial={props.weekPattern}
          defaultPhase={openDay ? phaseForDay(phases, openDay)?.id : undefined}
          onClose={() => setDialog(null)}
          onSave={async (phaseId, pattern, replace) => {
            const res = await props.fillPattern(templateId, phaseId, pattern, replace);
            if (res.ok) {
              setDialog(null);
              after(res);
            }
            return res;
          }}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------ */
/* Dialog shell                                                              */
/* ------------------------------------------------------------------------ */

/**
 * A sheet from the bottom on a phone, a centred window on a desktop. Fixed
 * to the viewport with a zero inset — never wider than the screen.
 */
function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <SystemWindow
        title={title}
        meta={
          <button type="button" aria-label="Close" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={14} />
          </button>
        }
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto"
      >
        <SystemWindowContent className="flex flex-col gap-4">{children}</SystemWindowContent>
      </SystemWindow>
    </div>
  );
}

function ErrorLine({ text }: { text: string | null }) {
  if (!text) return null;
  return (
    <p role="alert" className="readout border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------------ */
/* Add / edit an activity                                                    */
/* ------------------------------------------------------------------------ */

function ActivityDialog({
  dialog,
  totalDays,
  phases,
  workouts,
  cardioTypes,
  onClose,
  onSave,
}: {
  dialog: Extract<Dialog, { mode: 'add' } | { mode: 'edit' }>;
  totalDays: number;
  phases: CalPhase[];
  workouts: Named[];
  cardioTypes: Named[];
  onClose: () => void;
  onSave: (dayIndex: number, input: ItemInput, repeat: RepeatInput | null) => Promise<CalendarResult>;
}) {
  const editing = dialog.mode === 'edit' ? dialog.item : null;
  const [dayIndex, setDayIndex] = useState(String(editing?.dayIndex ?? (dialog.mode === 'add' ? dialog.dayIndex : 1)));
  const [kind, setKind] = useState<string>(editing?.kind ?? (dialog.mode === 'add' ? dialog.kind : 'workout'));
  const [workoutId, setWorkoutId] = useState(
    editing?.workoutId ?? (dialog.mode === 'add' ? dialog.workoutId : undefined) ?? workouts[0]?.id ?? ''
  );
  const [cardioTypeId, setCardioTypeId] = useState(editing ? editing.cardioTypeId ?? '' : cardioTypes[0]?.id ?? '');
  const [minutes, setMinutes] = useState(editing?.cardioMinutes ? String(editing.cardioMinutes) : '');
  const [target, setTarget] = useState(editing?.cardioTarget ?? '');
  const [steps, setSteps] = useState(editing?.stepTarget ? String(editing.stepTarget) : '');
  const [label, setLabel] = useState(editing?.label ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [repeatOn, setRepeatOn] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([]);
  const [repeatMode, setRepeatMode] = useState<'weeks' | 'phase'>('weeks');
  const [repeatWeeks, setRepeatWeeks] = useState('4');
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  const day = Number(dayIndex);
  const phase = Number.isInteger(day) ? phaseForDay(phases, day) : null;

  // Ticking repeat starts with the picked day's own position ticked, which is
  // what "repeat this" nearly always means.
  function toggleRepeat(on: boolean) {
    setRepeatOn(on);
    if (on && weekdays.length === 0 && Number.isInteger(day) && day >= 1) setWeekdays([weekdayOf(day)]);
  }

  function submit() {
    setError(null);
    if (!Number.isInteger(day) || day < 1) {
      setError('Pick a day number.');
      return;
    }
    const input: ItemInput = {
      kind,
      workoutId,
      cardioTypeId: cardioTypeId || null,
      cardioMinutes: minutes,
      cardioTarget: target,
      stepTarget: steps,
      label,
      note,
    };
    const repeat: RepeatInput | null =
      !editing && repeatOn && weekdays.length > 0
        ? { weekdays, weeks: Number(repeatWeeks) || 1, toPhaseEnd: repeatMode === 'phase' }
        : null;
    startSaving(async () => {
      const res = await onSave(day, input, repeat);
      if (!res.ok) setError(res.message ?? 'That did not save.');
    });
  }

  return (
    <Sheet title={editing ? 'Edit activity' : 'Add activity'} onClose={onClose}>
      <div className="grid grid-cols-2 gap-3">
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Day</span>
          <input
            type="number"
            min={1}
            max={Math.max(totalDays, 364)}
            inputMode="numeric"
            value={dayIndex}
            onChange={(e) => setDayIndex(e.target.value)}
            className={selectClass}
          />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>What</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className={selectClass}>
            {CALENDAR_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        {Number.isInteger(day) && day >= 1
          ? `Week ${weekOf(day)}, day ${weekdayOf(day)}${phase ? ` · ${phase.name}` : ''}`
          : ' '}
      </p>

      {kind === 'workout' && (
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Workout</span>
          {workouts.length === 0 ? (
            <span className="text-sm text-muted-foreground">This program has no workouts yet — build one in a phase first.</span>
          ) : (
            <select value={workoutId} onChange={(e) => setWorkoutId(e.target.value)} className={selectClass}>
              {workouts.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          )}
        </label>
      )}

      {kind === 'cardio' && (
        <>
          <div className="grid grid-cols-[1fr_96px] gap-3">
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Type</span>
              <select value={cardioTypeId} onChange={(e) => setCardioTypeId(e.target.value)} className={selectClass}>
                <option value="">— other (name it below) —</option>
                {cardioTypes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={labelClass}>Minutes</span>
              <input
                type="number"
                min={1}
                max={600}
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value)}
                className={selectClass}
              />
            </label>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className={labelClass}>Target</span>
            <textarea
              rows={2}
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="e.g. 1 km easy, then 6 x 100 m hard"
              className="w-full border border-input bg-secondary/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
        </>
      )}

      {kind !== 'workout' && (
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>{kind === 'cardio' ? 'Name (optional)' : 'Title (optional)'}</span>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={kind === 'cardio' ? 'e.g. Swimming' : KIND_LABELS[kind as CalendarKind]}
            maxLength={80}
            className={selectClass}
          />
        </label>
      )}

      {['workout', 'cardio', 'rest'].includes(kind) && (
        <label className="flex flex-col gap-1.5">
          <span className={labelClass}>Daily steps (optional)</span>
          <input
            type="number"
            min={0}
            max={100000}
            step={500}
            inputMode="numeric"
            value={steps}
            onChange={(e) => setSteps(e.target.value)}
            className={selectClass}
          />
        </label>
      )}

      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>{kind === 'message' ? 'Message' : 'Note to the client (optional)'}</span>
        <textarea
          rows={kind === 'message' ? 4 : 2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={kind === 'message' ? 'Sent from you in their messages on this day.' : ''}
          className="w-full border border-input bg-secondary/40 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </label>

      {!editing && (
        <div className="flex flex-col gap-3 border-t border-border/60 pt-3">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={repeatOn} onChange={(e) => toggleRepeat(e.target.checked)} />
            Repeat every week
          </label>
          {repeatOn && (
            <>
              <div className="flex flex-wrap gap-1.5">
                {[1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = weekdays.includes(d);
                  return (
                    <button
                      key={d}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setWeekdays(on ? weekdays.filter((x) => x !== d) : [...weekdays, d])}
                      className={cn(
                        'readout h-9 w-11 border text-[11px] uppercase',
                        on ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted-foreground'
                      )}
                    >
                      D{d}
                    </button>
                  );
                })}
              </div>
              <p className="text-xs text-muted-foreground">
                Days of the program week — D1 is the client&apos;s start day (Monday, if they start on a Monday).
              </p>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input type="radio" checked={repeatMode === 'weeks'} onChange={() => setRepeatMode('weeks')} />
                  for
                  <input
                    type="number"
                    min={1}
                    max={52}
                    value={repeatWeeks}
                    onChange={(e) => setRepeatWeeks(e.target.value)}
                    className={cn(selectClass, 'h-9 w-16')}
                  />
                  weeks
                </label>
                <label className="flex items-center gap-2">
                  <input type="radio" checked={repeatMode === 'phase'} onChange={() => setRepeatMode('phase')} />
                  to the end of {phase ? phase.name : 'the phase'}
                </label>
              </div>
            </>
          )}
        </div>
      )}

      <ErrorLine text={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" size="sm" disabled={saving} onClick={submit}>
          {saving ? 'Saving…' : editing ? 'Save' : 'Add'}
        </Button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/* Copy a week                                                               */
/* ------------------------------------------------------------------------ */

function CopyWeekDialog({
  week,
  totalWeeks,
  onClose,
  onSave,
}: {
  week: number;
  totalWeeks: number;
  onClose: () => void;
  onSave: (toWeeks: number[], replace: boolean) => Promise<CalendarResult>;
}) {
  const [targets, setTargets] = useState<number[]>([]);
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();
  const others = Array.from({ length: totalWeeks }, (_, i) => i + 1).filter((w) => w !== week);

  return (
    <Sheet title={`Copy week ${week}`} onClose={onClose}>
      <p className="text-sm text-muted-foreground">Everything in week {week}, onto the same days of the weeks you pick.</p>
      <div className="flex flex-wrap gap-1.5">
        {others.map((w) => {
          const on = targets.includes(w);
          return (
            <button
              key={w}
              type="button"
              aria-pressed={on}
              onClick={() => setTargets(on ? targets.filter((x) => x !== w) : [...targets, w])}
              className={cn(
                'readout h-9 min-w-11 border px-2 text-[11px] uppercase',
                on ? 'border-accent bg-accent/15 text-accent' : 'border-border text-muted-foreground'
              )}
            >
              W{w}
            </button>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-3 text-xs">
        <button type="button" className="text-accent hover:underline" onClick={() => setTargets(others.filter((w) => w > week))}>
          All later weeks
        </button>
        <button type="button" className="text-muted-foreground hover:underline" onClick={() => setTargets([])}>
          Clear
        </button>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace what is already on those weeks
      </label>
      <ErrorLine text={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || targets.length === 0}
          onClick={() =>
            startSaving(async () => {
              setError(null);
              const res = await onSave(targets, replace);
              if (!res.ok) setError(res.message ?? 'That did not save.');
            })
          }
        >
          {saving ? 'Copying…' : `Copy to ${targets.length} week${targets.length === 1 ? '' : 's'}`}
        </Button>
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------------------ */
/* Fill a phase from a seven-day pattern                                     */
/* ------------------------------------------------------------------------ */

type Slot = { main: string; cardioTypeId: string; minutes: string };

function slotsFrom(pattern: PatternEntry[][]): Slot[] {
  return Array.from({ length: 7 }, (_, i) => {
    const entries = pattern[i] ?? [];
    const main = entries.find((e) => e.kind === 'workout' || e.kind === 'rest');
    const cardio = entries.find((e) => e.cardioTypeId);
    return {
      main: main ? (main.kind === 'rest' ? 'rest' : `w:${main.workoutId}`) : '',
      cardioTypeId: cardio?.cardioTypeId ?? '',
      minutes: cardio?.cardioMinutes ? String(cardio.cardioMinutes) : '',
    };
  });
}

function FillPatternDialog({
  phases,
  workouts,
  cardioTypes,
  initial,
  defaultPhase,
  onClose,
  onSave,
}: {
  phases: CalPhase[];
  workouts: Named[];
  cardioTypes: Named[];
  initial: PatternEntry[][];
  defaultPhase?: string;
  onClose: () => void;
  onSave: (phaseId: string, pattern: PatternEntry[][], replace: boolean) => Promise<CalendarResult>;
}) {
  const [phaseId, setPhaseId] = useState(defaultPhase ?? phases[0]?.id ?? '');
  const [slots, setSlots] = useState<Slot[]>(() => slotsFrom(initial));
  const [steps, setSteps] = useState(() => {
    const s = initial.flat().find((e) => e.stepTarget)?.stepTarget;
    return s ? String(s) : '';
  });
  const [replace, setReplace] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, startSaving] = useTransition();

  function setSlot(i: number, patch: Partial<Slot>) {
    setSlots(slots.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  }

  function build(): PatternEntry[][] {
    const stepTarget = Number(steps) > 0 ? Math.round(Number(steps)) : null;
    return slots.map((s) => {
      const out: PatternEntry[] = [];
      const base = { cardioTypeId: null, cardioMinutes: null, cardioTarget: null, label: null, workoutId: null, stepTarget: null };
      if (s.main === 'rest') out.push({ ...base, kind: 'rest', stepTarget });
      else if (s.main.startsWith('w:')) out.push({ ...base, kind: 'workout', workoutId: s.main.slice(2), stepTarget });
      if (s.cardioTypeId) {
        out.push({
          ...base,
          kind: 'cardio',
          cardioTypeId: s.cardioTypeId,
          cardioMinutes: Number(s.minutes) > 0 ? Math.round(Number(s.minutes)) : null,
          // Steps ride on the day's first item only, so they're not counted twice.
          stepTarget: out.length === 0 ? stepTarget : null,
        });
      }
      return out;
    });
  }

  return (
    <Sheet title="Fill from a weekly pattern" onClose={onClose}>
      <p className="text-sm text-muted-foreground">
        Set one week and it&apos;s stamped onto every week of the phase. Prefilled from the program&apos;s
        weekly pattern; D1 is Monday when the client starts on a Monday.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Phase</span>
        <select value={phaseId} onChange={(e) => setPhaseId(e.target.value)} className={selectClass}>
          {phases.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} (Days {p.startDay}–{p.endDay})
            </option>
          ))}
        </select>
      </label>
      <ul className="flex flex-col gap-2">
        {slots.map((s, i) => (
          <li key={i} className="grid grid-cols-[32px_1fr] items-center gap-2 sm:grid-cols-[32px_1fr_1fr_72px]">
            <span className="readout text-[11px] uppercase text-muted-foreground">D{i + 1}</span>
            <select value={s.main} onChange={(e) => setSlot(i, { main: e.target.value })} className={selectClass}>
              <option value="">— nothing —</option>
              <option value="rest">Rest day</option>
              {workouts.map((w) => (
                <option key={w.id} value={`w:${w.id}`}>
                  {w.name}
                </option>
              ))}
            </select>
            <span className="hidden sm:contents">
              <select value={s.cardioTypeId} onChange={(e) => setSlot(i, { cardioTypeId: e.target.value })} className={selectClass}>
                <option value="">no cardio</option>
                {cardioTypes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={600}
                placeholder="Mins"
                value={s.minutes}
                onChange={(e) => setSlot(i, { minutes: e.target.value })}
                className={selectClass}
              />
            </span>
            {/* Phones: cardio on its own line under the day. */}
            <span className="col-span-2 grid grid-cols-[32px_1fr_72px] gap-2 sm:hidden">
              <span />
              <select value={s.cardioTypeId} onChange={(e) => setSlot(i, { cardioTypeId: e.target.value })} className={selectClass}>
                <option value="">no cardio</option>
                {cardioTypes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min={0}
                max={600}
                placeholder="Mins"
                value={s.minutes}
                onChange={(e) => setSlot(i, { minutes: e.target.value })}
                className={selectClass}
              />
            </span>
          </li>
        ))}
      </ul>
      <label className="flex flex-col gap-1.5">
        <span className={labelClass}>Daily steps (optional)</span>
        <input
          type="number"
          min={0}
          max={100000}
          step={500}
          value={steps}
          onChange={(e) => setSteps(e.target.value)}
          className={cn(selectClass, 'w-36')}
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} />
        Replace what is already in this phase
      </label>
      <ErrorLine text={error} />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={saving || !phaseId}
          onClick={() =>
            startSaving(async () => {
              setError(null);
              const res = await onSave(phaseId, build(), replace);
              if (!res.ok) setError(res.message ?? 'That did not save.');
            })
          }
        >
          {saving ? 'Filling…' : 'Fill phase'}
        </Button>
      </div>
    </Sheet>
  );
}
