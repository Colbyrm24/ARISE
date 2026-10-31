'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Dumbbell,
  GripVertical,
  Link2,
  Plus,
  Search,
  Timer,
  Trash2,
  Unlink,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { MAX_SETS_PER_EXERCISE } from '@/lib/set-prescription';
import {
  cleanPrescription,
  equipmentFor,
  estimateFromRows,
  filterLibrary,
  groupAsSuperset,
  groupBlocks,
  moveRow,
  prescriptionText,
  restBetweenText,
  restBlockText,
  ungroup,
  type BuilderResult,
  type BuilderRow,
  type LibraryItem,
  type LibrarySort,
  type RowPrescription,
} from '@/lib/workout-builder';

/*
  The workout builder, the way Trainerize lays theirs out.

  Left: the workout — name, minutes, instructions, equipment — and its
  exercises, each with its prescription in one line ("3 sets x 8–10 reps +
  drop set", "Rest 2 min between sets") that opens into boxes to edit. Tick
  rows to superset, duplicate or delete them; drag to reorder; drop a rest
  block between movements. Right: the exercise library, searchable and
  filterable, click or drag a card in.

  On a phone the two halves are tabs, because side by side at 390px is two
  unusable columns. Dragging inside a scrolling page fights the thumb, so
  every drag has a tap equivalent: tap a card to add it, tap a row's grip
  then tap where it goes — the same pattern as the client calendar.

  Everything saves as it happens. Each change is shown at once and queued to
  the server in order; the server answers with the workout as it now stands,
  and the screen takes that as the truth once the queue is empty. If a save is
  refused the rows snap back to what was saved and the reason is shown.
*/

type Actions = {
  saveWorkoutDetails: (
    workoutId: string,
    patch: { name?: string; instructions?: string; estMinutes?: string | number | null }
  ) => Promise<BuilderResult>;
  addExerciseToWorkout: (workoutId: string, exerciseId: string, beforeId?: string | null) => Promise<BuilderResult>;
  reorderWorkout: (workoutId: string, order: { id: string; supersetGroup: string | null }[]) => Promise<BuilderResult>;
  saveRow: (
    workoutId: string,
    rowId: string,
    patch: { prescription?: Partial<Record<keyof RowPrescription, unknown>>; notes?: string | null }
  ) => Promise<BuilderResult>;
  setRestAfter: (workoutId: string, rowId: string, seconds: number | null) => Promise<BuilderResult>;
  duplicateRows: (workoutId: string, ids: string[]) => Promise<BuilderResult>;
  deleteRows: (workoutId: string, ids: string[]) => Promise<BuilderResult>;
  createCustomExercise: (input: {
    name: string;
    musclePrimary: string;
    equipment: string;
    videoUrl?: string;
  }) => Promise<{ ok: boolean; message?: string; item?: LibraryItem }>;
};

type Props = {
  programId: string;
  programName: string;
  /** Where SAVE and the back link go — the phase this workout is listed in. */
  backHref?: string;
  workout: {
    id: string;
    name: string;
    instructions: string | null;
    estMinutes: number | null;
    estMinutesManual: boolean;
    equipment: string[];
  };
  initialRows: BuilderRow[];
  library: LibraryItem[];
  actions: Actions;
};

const REST_CHOICES = [30, 45, 60, 90, 120, 180, 240, 300];

const field =
  'h-10 w-full min-w-0 border border-input bg-secondary/40 px-2 text-sm text-foreground ' +
  'focus-visible:border-accent/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent/50';

const tinyLabel = 'readout text-[9px] uppercase tracking-wider text-muted-foreground';

const newId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

const orderOf = (rows: BuilderRow[]) => rows.map((r) => ({ id: r.id, supersetGroup: r.supersetGroup }));

export function WorkoutBuilder({ programId, programName, backHref, workout, initialRows, library: initialLibrary, actions }: Props) {
  const back = backHref ?? `/coach/programs/${programId}`;
  const router = useRouter();

  const [rows, setRows] = useState<BuilderRow[]>(initialRows);
  const [name, setName] = useState(workout.name);
  const [instructions, setInstructions] = useState(workout.instructions ?? '');
  const [estManual, setEstManual] = useState(workout.estMinutesManual);
  const [estText, setEstText] = useState(
    workout.estMinutesManual && workout.estMinutes ? String(workout.estMinutes) : ''
  );
  const [library, setLibrary] = useState(initialLibrary);
  const savedEst = useRef(estText);

  const [pending, setPending] = useState(0);
  const [saved, setSaved] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<string | null>(null);
  const [tab, setTab] = useState<'workout' | 'library'>('workout');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Drag state: a row being reordered, or a library card being added.
  const [armed, setArmed] = useState<string | null>(null);
  const [dragRow, setDragRow] = useState<string | null>(null);
  const [dragExercise, setDragExercise] = useState<string | null>(null);
  const [over, setOver] = useState<{ id: string | null; after: boolean } | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  /*
    One save at a time, in the order they were made. Two saves racing — a
    reorder and a delete, say — could otherwise land in either order and leave
    the database disagreeing with the screen.
  */
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const inFlight = useRef(0);

  function run(save: () => Promise<BuilderResult>) {
    inFlight.current += 1;
    setPending(inFlight.current);
    setNotice(null);
    const job = queue.current.then(async () => {
      let res: BuilderResult;
      try {
        res = await save();
      } catch {
        res = { ok: false, message: 'That did not save — check your connection and try again.' };
      }
      inFlight.current -= 1;
      setPending(inFlight.current);
      // Only the last answer in a burst is the truth worth showing; an
      // earlier one would flash the screen back a step. A refusal always
      // wins, so a rejected change never sits on screen looking saved.
      if (res.rows && (inFlight.current === 0 || !res.ok)) setRows(res.rows);
      if (res.estMinutesManual !== undefined && inFlight.current === 0) setEstManual(res.estMinutesManual);
      if (!res.ok) setNotice({ ok: false, text: res.message ?? 'That did not save.' });
      else if (res.message) setNotice({ ok: true, text: res.message });
      setSaved(true);
    });
    queue.current = job;
    return job;
  }

  // Leaving with a save still in the air would lose it.
  useEffect(() => {
    if (pending === 0) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending]);

  /* ---------------------------------------------------------------------- */
  /* Header fields                                                          */
  /* ---------------------------------------------------------------------- */

  const autoMinutes = useMemo(() => estimateFromRows(rows), [rows]);
  const equipment = useMemo(() => equipmentFor(rows), [rows]);

  function saveName() {
    const n = name.trim();
    if (!n) {
      setName(workout.name);
      return;
    }
    run(() => actions.saveWorkoutDetails(workout.id, { name: n }));
  }

  /* ---------------------------------------------------------------------- */
  /* Rows                                                                   */
  /* ---------------------------------------------------------------------- */

  function reorder(next: BuilderRow[]) {
    setRows(next);
    run(() => actions.reorderWorkout(workout.id, orderOf(next)));
  }

  function moveTo(id: string, beforeId: string | null) {
    const next = moveRow(rows, id, beforeId, newId);
    // Dropped where it already was: nothing to save.
    const same = next.every((r, i) => r.id === rows[i]?.id && r.supersetGroup === rows[i]?.supersetGroup);
    if (!same) reorder(next);
  }

  function addExercise(exerciseId: string, beforeId: string | null = null) {
    const ex = library.find((e) => e.id === exerciseId);
    if (!ex) return;
    // Shown straight away under a temporary id; the server's answer swaps
    // in the real row.
    const temp: BuilderRow = {
      id: `pending-${newId()}`,
      exerciseId: ex.id,
      name: ex.name,
      musclePrimary: ex.musclePrimary,
      equipment: ex.equipment,
      thumb: ex.thumb,
      supersetGroup: null,
      restAfterSeconds: null,
      notes: null,
      prescription: cleanPrescription({}),
    };
    const at = beforeId ? rows.findIndex((r) => r.id === beforeId) : -1;
    setRows(at >= 0 ? [...rows.slice(0, at), temp, ...rows.slice(at)] : [...rows, temp]);
    const realBefore = beforeId && !beforeId.startsWith('pending-') ? beforeId : null;
    run(() => actions.addExerciseToWorkout(workout.id, exerciseId, realBefore));
    if (tab === 'library') setNotice({ ok: true, text: `Added ${ex.name}.` });
  }

  function updatePrescription(row: BuilderRow, patch: Partial<RowPrescription>) {
    const next = cleanPrescription({ ...row.prescription, ...patch });
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, prescription: next } : r)));
    if (row.id.startsWith('pending-')) return;
    run(() => actions.saveRow(workout.id, row.id, { prescription: patch }));
  }

  function updateNotes(row: BuilderRow, notes: string) {
    if ((row.notes ?? '') === notes.trim()) return;
    setRows((cur) => cur.map((r) => (r.id === row.id ? { ...r, notes: notes.trim() || null } : r)));
    if (row.id.startsWith('pending-')) return;
    run(() => actions.saveRow(workout.id, row.id, { notes }));
  }

  /**
   * A rest block goes after the row — or, inside a superset, after the
   * superset's last member, since resting between A1 and A2 is not a superset.
   */
  function restTarget(rowId: string) {
    const block = groupBlocks(rows).find((b) => b.rows.some((r) => r.row.id === rowId));
    return block ? block.rows[block.rows.length - 1]!.row.id : rowId;
  }

  function setRest(rowId: string, seconds: number | null) {
    const target = rowId.startsWith('pending-') ? null : rowId;
    if (!target) return;
    setRows((cur) => cur.map((r) => (r.id === target ? { ...r, restAfterSeconds: seconds } : r)));
    run(() => actions.setRestAfter(workout.id, target, seconds));
  }

  function addRest() {
    const ids = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
    const anchor = ids.length ? ids[ids.length - 1]! : rows[rows.length - 1]?.id;
    if (!anchor) return;
    setRest(restTarget(anchor), 120);
  }

  const selectedIds = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const anyGrouped = rows.some((r) => selected.has(r.id) && r.supersetGroup);

  function toggleSelect(id: string) {
    setConfirmDelete(false);
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function doSuperset() {
    reorder(groupAsSuperset(rows, selectedIds, newId));
    setSelected(new Set());
  }

  function doUngroup() {
    reorder(ungroup(rows, selectedIds, newId));
    setSelected(new Set());
  }

  function doDuplicate() {
    const ids = selectedIds.filter((id) => !id.startsWith('pending-'));
    if (!ids.length) return;
    const next: BuilderRow[] = [];
    for (const r of rows) {
      next.push(r);
      if (ids.includes(r.id)) next.push({ ...r, id: `pending-${newId()}` });
    }
    setRows(next);
    setSelected(new Set());
    run(() => actions.duplicateRows(workout.id, ids));
  }

  function doDelete() {
    const ids = selectedIds.filter((id) => !id.startsWith('pending-'));
    setRows(rows.filter((r) => !selected.has(r.id)));
    setSelected(new Set());
    setConfirmDelete(false);
    if (ids.length) run(() => actions.deleteRows(workout.id, ids));
  }

  /* ---------------------------------------------------------------------- */
  /* Drag and drop                                                          */
  /* ---------------------------------------------------------------------- */

  function endDrag() {
    setDragRow(null);
    setDragExercise(null);
    setOver(null);
    setArmed(null);
  }

  /** Which row a drop at this position lands before. */
  function beforeIdFor(target: { id: string | null; after: boolean }) {
    if (target.id === null) return null;
    if (!target.after) return target.id;
    const at = rows.findIndex((r) => r.id === target.id);
    return rows[at + 1]?.id ?? null;
  }

  function onDrop() {
    if (!over) return endDrag();
    const before = beforeIdFor(over);
    if (dragRow) moveTo(dragRow, before);
    else if (dragExercise) addExercise(dragExercise, before);
    endDrag();
  }

  const dragging = Boolean(dragRow || dragExercise);

  /* ---------------------------------------------------------------------- */
  /* Leaving                                                                */
  /* ---------------------------------------------------------------------- */

  const [leaving, setLeaving] = useState(false);
  async function done() {
    setLeaving(true);
    await queue.current;
    router.push(back);
    router.refresh();
  }

  const blocks = groupBlocks(rows);
  const pickedRow = picked ? rows.find((r) => r.id === picked) : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      {/* Top bar: back, where you are, save state, done. */}
      <header className="flex items-center gap-3 border-b border-border px-4 py-3 sm:px-6">
        <Link
          href={back}
          onClick={(e) => {
            // A save still queued would be lost by navigating away mid-flight.
            if (inFlight.current > 0) {
              e.preventDefault();
              done();
            }
          }}
          className="readout inline-flex min-w-0 items-center gap-1.5 text-[11px] uppercase text-muted-foreground hover:text-accent"
        >
          <ArrowLeft size={14} className="shrink-0" />
          <span className="truncate">{programName}</span>
        </Link>
        <span className="flex-1" />
        <span
          role="status"
          className={cn(
            'readout shrink-0 text-[10px] uppercase tracking-wider',
            notice && !notice.ok ? 'text-destructive' : pending ? 'text-muted-foreground' : 'text-success'
          )}
        >
          {pending ? 'Saving…' : notice && !notice.ok ? 'Not saved' : saved ? (
            <span className="inline-flex items-center gap-1">
              <Check size={11} /> Saved
            </span>
          ) : (
            'Autosaves'
          )}
        </span>
        <Button size="sm" onClick={done} disabled={leaving}>
          {leaving ? 'Saving…' : 'Save'}
        </Button>
      </header>

      {/* Phones: the two halves as tabs. */}
      <div className="grid grid-cols-2 border-b border-border lg:hidden">
        {(['workout', 'library'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              'readout py-2.5 text-[11px] uppercase tracking-wider',
              tab === t ? 'border-b-2 border-accent text-foreground' : 'text-muted-foreground'
            )}
          >
            {t === 'workout' ? `Workout · ${rows.length}` : 'Exercise library'}
          </button>
        ))}
      </div>

      {notice && (
        <p
          className={cn(
            'readout border-b px-4 py-2 text-xs sm:px-6',
            notice.ok
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-destructive/40 bg-destructive/10 text-destructive'
          )}
        >
          {notice.text}
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* ---------------------------------------------------------------- */}
        {/* LEFT: the workout                                                */}
        {/* ---------------------------------------------------------------- */}
        <section
          className={cn(
            'min-h-0 w-full flex-col overflow-y-auto lg:flex lg:w-[56%] lg:border-r lg:border-border',
            tab === 'workout' ? 'flex' : 'hidden'
          )}
        >
          <div className="flex flex-col gap-4 px-4 py-5 sm:px-6">
            <label className="flex flex-col gap-1">
              <span className={tinyLabel}>Workout name</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                maxLength={120}
                className={cn(field, 'h-11 text-lg font-semibold')}
              />
            </label>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex w-28 flex-col gap-1">
                <span className={tinyLabel}>Est. minutes</span>
                <input
                  value={estText}
                  inputMode="numeric"
                  placeholder={autoMinutes ? String(autoMinutes) : '—'}
                  onChange={(e) => setEstText(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  onBlur={() => {
                    const typed = estText.trim();
                    if (typed === savedEst.current) return;
                    savedEst.current = typed;
                    setEstManual(Boolean(typed));
                    run(() => actions.saveWorkoutDetails(workout.id, { estMinutes: typed || null }));
                  }}
                  className={field}
                />
              </label>
              <p className="pb-2 text-xs text-muted-foreground">
                {estManual && estText
                  ? 'Your number. Clear it to estimate from the sets.'
                  : `Estimated from sets, reps and rest${autoMinutes ? `: ${autoMinutes} min` : ''}.`}
              </p>
            </div>

            {equipment.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {equipment.map((e) => (
                  <span
                    key={e}
                    className="readout border border-border px-2 py-0.5 text-[10px] uppercase tracking-wider text-muted-foreground"
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}

            <label className="flex flex-col gap-1">
              <span className={tinyLabel}>Instructions</span>
              <textarea
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                onBlur={() => {
                  if (instructions.trim() === (workout.instructions ?? '').trim()) return;
                  run(() => actions.saveWorkoutDetails(workout.id, { instructions }));
                }}
                rows={3}
                maxLength={4000}
                placeholder="What you want out of this session: warm-up, focus, how hard to push."
                className={cn(field, 'h-auto py-2 leading-relaxed')}
              />
            </label>
          </div>

          {/* Toolbar: acts on the ticked rows. */}
          <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-y border-border bg-background/95 px-4 py-2 backdrop-blur sm:px-6">
            <span className="readout mr-auto text-[10px] uppercase tracking-wider text-muted-foreground">
              {selectedIds.length ? `${selectedIds.length} selected` : `Exercises · ${rows.length}`}
            </span>
            {selectedIds.length >= 2 && (
              <ToolButton onClick={doSuperset} icon={<Link2 size={13} />}>
                Superset
              </ToolButton>
            )}
            {anyGrouped && (
              <ToolButton onClick={doUngroup} icon={<Unlink size={13} />}>
                Ungroup
              </ToolButton>
            )}
            {selectedIds.length > 0 && (
              <>
                <ToolButton onClick={doDuplicate} icon={<Copy size={13} />}>
                  Duplicate
                </ToolButton>
                {confirmDelete ? (
                  <ToolButton onClick={doDelete} icon={<Trash2 size={13} />} danger>
                    Delete {selectedIds.length}
                  </ToolButton>
                ) : (
                  <ToolButton onClick={() => setConfirmDelete(true)} icon={<Trash2 size={13} />}>
                    Delete
                  </ToolButton>
                )}
                <ToolButton onClick={() => setSelected(new Set())} icon={<X size={13} />}>
                  Clear
                </ToolButton>
              </>
            )}
            {rows.length > 0 && (
              <ToolButton onClick={addRest} icon={<Timer size={13} />}>
                Add rest
              </ToolButton>
            )}
          </div>

          {pickedRow && (
            <div className="flex items-center justify-between gap-3 border-b border-accent/60 bg-accent/[0.07] px-4 py-2 text-sm sm:px-6">
              <span className="min-w-0">
                Moving <span className="font-medium text-accent">{pickedRow.name}</span> — tap the exercise it
                should go above.
              </span>
              <span className="flex shrink-0 gap-3">
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => {
                    moveTo(pickedRow.id, null);
                    setPicked(null);
                  }}
                >
                  To end
                </button>
                <button type="button" className="text-xs text-muted-foreground" onClick={() => setPicked(null)}>
                  Cancel
                </button>
              </span>
            </div>
          )}

          <div
            className="flex flex-col gap-2 px-4 py-4 sm:px-6"
            onDragOver={(e) => {
              if (!dragging) return;
              e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              onDrop();
            }}
          >
            {rows.length === 0 && (
              <div
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOver({ id: null, after: false });
                }}
                className={cn(
                  'flex flex-col items-center gap-2 border border-dashed border-border px-4 py-12 text-center',
                  over && 'border-accent bg-accent/[0.06]'
                )}
              >
                <Dumbbell size={22} className="text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  <span className="hidden lg:inline">Drag exercises here from the library, or click one to add it.</span>
                  <span className="lg:hidden">Open the exercise library tab and tap an exercise to add it.</span>
                </p>
                <button
                  type="button"
                  onClick={() => setTab('library')}
                  className="readout text-[11px] uppercase text-accent lg:hidden"
                >
                  Open library
                </button>
              </div>
            )}

            {blocks.map((block) => {
              const lastRow = block.rows[block.rows.length - 1]!.row;
              return (
                <div key={block.key} className="flex flex-col gap-2">
                  <div
                    className={cn(
                      'flex flex-col',
                      block.superset && 'gap-0 border border-accent/50 bg-accent/[0.04]'
                    )}
                  >
                    {block.superset && (
                      <div className="flex items-center justify-between gap-2 border-b border-accent/30 px-3 py-1.5">
                        <span className="readout text-[10px] uppercase tracking-wider text-accent">
                          Superset {block.letter} · back to back
                        </span>
                      </div>
                    )}
                    {block.rows.map(({ row, label }) => (
                      <RowCard
                        key={row.id}
                        row={row}
                        label={label}
                        inSuperset={block.superset}
                        selected={selected.has(row.id)}
                        open={open === row.id}
                        armed={armed === row.id}
                        isDragging={dragRow === row.id}
                        picked={picked === row.id}
                        dropMark={over && over.id === row.id ? (over.after ? 'after' : 'before') : null}
                        onToggleSelect={() => toggleSelect(row.id)}
                        onToggleOpen={() => setOpen((cur) => (cur === row.id ? null : row.id))}
                        onArm={() => setArmed(row.id)}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', row.id);
                          e.dataTransfer.effectAllowed = 'move';
                          setDragRow(row.id);
                          setPicked(null);
                        }}
                        onDragEnd={endDrag}
                        onDragOverRow={(e) => {
                          if (!dragging) return;
                          e.preventDefault();
                          const rect = e.currentTarget.getBoundingClientRect();
                          const after = e.clientY > rect.top + rect.height / 2;
                          if (!over || over.id !== row.id || over.after !== after) setOver({ id: row.id, after });
                        }}
                        onPickHandle={() => setPicked((cur) => (cur === row.id ? null : row.id))}
                        onRowTapWhilePicking={
                          picked && picked !== row.id
                            ? () => {
                                moveTo(picked, row.id);
                                setPicked(null);
                              }
                            : undefined
                        }
                        onPrescription={(patch) => updatePrescription(row, patch)}
                        onNotes={(notes) => updateNotes(row, notes)}
                        onAddRest={() => setRest(restTarget(row.id), 120)}
                        hasRest={Boolean(rows.find((r) => r.id === restTarget(row.id))?.restAfterSeconds)}
                      />
                    ))}
                  </div>
                  {block.rows.map(({ row }) =>
                    row.restAfterSeconds ? (
                      <RestBlock
                        key={`rest-${row.id}`}
                        seconds={row.restAfterSeconds}
                        onChange={(s) => setRest(row.id, s)}
                        onRemove={() => setRest(row.id, null)}
                        faded={row.id !== lastRow.id}
                      />
                    ) : null
                  )}
                </div>
              );
            })}

            {rows.length > 0 && (
              <div
                onDragOver={(e) => {
                  if (!dragging) return;
                  e.preventDefault();
                  setOver({ id: null, after: false });
                }}
                className={cn(
                  'hidden h-14 items-center justify-center border border-dashed text-xs text-muted-foreground lg:flex',
                  dragging && over?.id === null ? 'border-accent bg-accent/[0.06] text-accent' : 'border-border/60'
                )}
              >
                {dragging ? 'Drop here to put it at the end' : 'Drag from the library to add'}
              </div>
            )}

            <button
              type="button"
              onClick={() => setTab('library')}
              className="flex h-12 items-center justify-center gap-2 border border-dashed border-border text-sm text-accent lg:hidden"
            >
              <Plus size={15} /> Add exercise
            </button>
          </div>
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* RIGHT: the library                                               */}
        {/* ---------------------------------------------------------------- */}
        <aside
          className={cn('min-h-0 w-full flex-col overflow-y-auto lg:flex lg:w-[44%]', tab === 'library' ? 'flex' : 'hidden')}
        >
          <Library
            items={library}
            onAdd={(id) => addExercise(id)}
            onDragStart={(id) => {
              setDragExercise(id);
              setPicked(null);
            }}
            onDragEnd={endDrag}
            createCustomExercise={async (input) => {
              const res = await actions.createCustomExercise(input);
              if (res.ok && res.item) {
                const item = res.item;
                setLibrary((cur) => [...cur, item]);
                // Added to the list straight away — the reason to make one
                // here rather than on the library page is to use it now.
                const temp: BuilderRow = {
                  id: `pending-${newId()}`,
                  exerciseId: item.id,
                  name: item.name,
                  musclePrimary: item.musclePrimary,
                  equipment: item.equipment,
                  thumb: item.thumb,
                  supersetGroup: null,
                  restAfterSeconds: null,
                  notes: null,
                  prescription: cleanPrescription({}),
                };
                setRows((cur) => [...cur, temp]);
                run(() => actions.addExerciseToWorkout(workout.id, item.id, null));
              }
              return res;
            }}
          />
        </aside>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function ToolButton({
  onClick,
  icon,
  children,
  danger,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'readout inline-flex h-8 items-center gap-1.5 border px-2.5 text-[10px] uppercase tracking-wider transition-colors',
        danger
          ? 'border-destructive/60 text-destructive hover:bg-destructive/10'
          : 'border-border text-foreground hover:border-accent/50 hover:text-accent'
      )}
    >
      {icon}
      {children}
    </button>
  );
}

function Thumb({ src, muscle, className }: { src: string | null; muscle: string; className?: string }) {
  return (
    <span
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden border border-border bg-secondary/40',
        className
      )}
    >
      {src ? (
        // Plain <img>: third-party thumbnails, and next/image would need
        // every host allow-listed in config for no real gain at this size.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="readout px-1 text-center text-[9px] uppercase leading-tight text-muted-foreground">
          {muscle}
        </span>
      )}
    </span>
  );
}

/**
 * A text box that holds its own draft while you type and saves on blur.
 *
 * Saving per keystroke would queue a server call per letter; saving only on
 * blur means typing is never fought by a server answer arriving mid-word.
 * When the saved value changes underneath (the server's truth after a
 * refusal) and the box is not being edited, it follows.
 */
function DraftInput({
  value,
  onCommit,
  className,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  className?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'onBlur'>) {
  const [draft, setDraft] = useState(value);
  const editing = useRef(false);
  useEffect(() => {
    if (!editing.current) setDraft(value);
  }, [value]);
  return (
    <input
      {...rest}
      value={draft}
      onFocus={() => (editing.current = true)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        editing.current = false;
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
      }}
      className={cn(field, className)}
    />
  );
}

function Stepper({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className={tinyLabel}>{label}</span>
      <div className="flex h-10 items-stretch border border-input bg-secondary/40">
        <button
          type="button"
          aria-label={`Fewer ${label}`}
          disabled={value <= min}
          onClick={() => onChange(value - 1)}
          className="w-9 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          −
        </button>
        <span className="readout flex flex-1 items-center justify-center text-sm tabular-nums">{value}</span>
        <button
          type="button"
          aria-label={`More ${label}`}
          disabled={value >= max}
          onClick={() => onChange(value + 1)}
          className="w-9 text-muted-foreground hover:text-foreground disabled:opacity-30"
        >
          +
        </button>
      </div>
    </div>
  );
}

function RowCard({
  row,
  label,
  inSuperset,
  selected,
  open,
  armed,
  isDragging,
  picked,
  dropMark,
  onToggleSelect,
  onToggleOpen,
  onArm,
  onDragStart,
  onDragEnd,
  onDragOverRow,
  onPickHandle,
  onRowTapWhilePicking,
  onPrescription,
  onNotes,
  onAddRest,
  hasRest,
}: {
  row: BuilderRow;
  label: string | null;
  inSuperset: boolean;
  selected: boolean;
  open: boolean;
  armed: boolean;
  isDragging: boolean;
  picked: boolean;
  dropMark: 'before' | 'after' | null;
  onToggleSelect: () => void;
  onToggleOpen: () => void;
  onArm: () => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  onDragOverRow: (e: React.DragEvent<HTMLDivElement>) => void;
  onPickHandle: () => void;
  onRowTapWhilePicking?: () => void;
  onPrescription: (patch: Partial<RowPrescription>) => void;
  onNotes: (notes: string) => void;
  onAddRest: () => void;
  hasRest: boolean;
}) {
  const p = row.prescription;
  const pendingRow = row.id.startsWith('pending-');
  const rest = restBetweenText(p.restSeconds);
  const total = p.warmup + p.working + p.drop;

  return (
    <div
      // Only draggable while the grip is held, so selecting text in the
      // boxes below never turns into dragging the whole row.
      draggable={armed && !pendingRow}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOverRow}
      onMouseUp={() => !isDragging && armed && onDragEnd()}
      onClickCapture={(e) => {
        if (onRowTapWhilePicking) {
          e.stopPropagation();
          e.preventDefault();
          onRowTapWhilePicking();
        }
      }}
      className={cn(
        'relative bg-card transition-opacity',
        inSuperset ? 'border-b border-accent/20 last:border-b-0' : 'border border-border',
        selected && 'ring-1 ring-inset ring-accent',
        picked && 'bg-accent/15',
        isDragging && 'opacity-40',
        pendingRow && 'opacity-70',
        onRowTapWhilePicking && 'cursor-pointer hover:bg-accent/[0.08]'
      )}
    >
      {dropMark && (
        <span
          aria-hidden
          className={cn('absolute left-0 right-0 z-10 h-0.5 bg-accent', dropMark === 'before' ? '-top-px' : '-bottom-px')}
        />
      )}

      <div className="flex items-start gap-2 p-2.5 sm:gap-3">
        <button
          type="button"
          title="Drag to reorder, or tap then tap where it goes"
          aria-label={`Move ${row.name}`}
          onMouseDown={onArm}
          onClick={onPickHandle}
          disabled={pendingRow}
          className="mt-3 shrink-0 cursor-grab text-muted-foreground hover:text-foreground active:cursor-grabbing"
        >
          <GripVertical size={16} />
        </button>
        <input
          type="checkbox"
          checked={selected}
          onChange={onToggleSelect}
          aria-label={`Select ${row.name}`}
          className="mt-3.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
        />
        <Thumb src={row.thumb} muscle={row.musclePrimary} className="h-12 w-14 sm:h-14 sm:w-20" />
        <button
          type="button"
          onClick={onToggleOpen}
          // Not editable until the server has given it a real id — an edit
          // to a row that does not exist yet would have nowhere to save.
          disabled={pendingRow}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left">
          <span className="flex w-full items-center gap-2">
            {label && (
              <span className="readout shrink-0 border border-accent/50 px-1 text-[10px] text-accent">{label}</span>
            )}
            <span className="truncate text-sm font-semibold">{row.name}</span>
          </span>
          <span className="text-xs text-foreground/85">{prescriptionText(p)}</span>
          {rest && <span className="readout text-[10px] uppercase text-muted-foreground">{rest}</span>}
          {row.notes && <span className="line-clamp-1 text-[11px] italic text-muted-foreground">{row.notes}</span>}
        </button>
        <button
          type="button"
          onClick={onToggleOpen}
          disabled={pendingRow}
          aria-label={open ? 'Close' : 'Edit prescription'}
          className="mt-3 shrink-0 text-muted-foreground hover:text-foreground"
        >
          {open ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-3 gap-2 border-t border-border/60 px-2.5 pb-3 pt-3 sm:grid-cols-6">
          <Stepper
            label="Warm-up"
            value={p.warmup}
            min={0}
            max={MAX_SETS_PER_EXERCISE - p.working - p.drop}
            onChange={(v) => onPrescription({ warmup: v })}
          />
          <Stepper
            label="Sets"
            value={p.working}
            min={1}
            max={MAX_SETS_PER_EXERCISE - p.warmup - p.drop}
            onChange={(v) => onPrescription({ working: v })}
          />
          <Stepper
            label="Drop sets"
            value={p.drop}
            min={0}
            max={MAX_SETS_PER_EXERCISE - p.warmup - p.working}
            onChange={(v) => onPrescription({ drop: v })}
          />
          <label className="flex flex-col gap-1">
            <span className={tinyLabel}>Reps</span>
            <DraftInput
              value={p.reps ?? ''}
              placeholder="8-10"
              maxLength={40}
              onCommit={(v) => onPrescription({ reps: v })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={tinyLabel}>Rest (sec)</span>
            <DraftInput
              value={p.restSeconds ? String(p.restSeconds) : ''}
              inputMode="numeric"
              placeholder="90"
              onCommit={(v) => onPrescription({ restSeconds: v ? Number(v) : null })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={tinyLabel}>Tempo</span>
            <DraftInput
              value={p.tempo ?? ''}
              placeholder="3-1-1-0"
              maxLength={20}
              onCommit={(v) => onPrescription({ tempo: v })}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className={tinyLabel}>Weight (lb)</span>
            <DraftInput
              value={p.weight ? String(p.weight) : ''}
              inputMode="decimal"
              placeholder="—"
              onCommit={(v) => onPrescription({ weight: v ? Number(v) : null })}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1 sm:col-span-5">
            <span className={tinyLabel}>Notes for the client</span>
            <DraftInput
              value={row.notes ?? ''}
              placeholder="e.g. pause at the bottom, last set to failure"
              maxLength={1000}
              onCommit={onNotes}
            />
          </label>
          <div className="col-span-3 flex flex-wrap items-center justify-between gap-2 sm:col-span-6">
            <span className="readout text-[10px] uppercase text-muted-foreground">
              {total} set rows on the client&apos;s screen
            </span>
            {!hasRest && (
              <button
                type="button"
                onClick={onAddRest}
                disabled={pendingRow}
                className="readout inline-flex items-center gap-1 text-[10px] uppercase text-accent hover:underline"
              >
                <Timer size={12} /> Rest after{inSuperset ? ' superset' : ''}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RestBlock({
  seconds,
  onChange,
  onRemove,
  faded,
}: {
  seconds: number;
  onChange: (s: number) => void;
  onRemove: () => void;
  faded?: boolean;
}) {
  const choices = REST_CHOICES.includes(seconds) ? REST_CHOICES : [...REST_CHOICES, seconds].sort((a, b) => a - b);
  return (
    <div
      className={cn(
        'flex items-center gap-3 border border-dashed border-border bg-secondary/20 px-3 py-2',
        faded && 'opacity-70'
      )}
    >
      <Timer size={14} className="shrink-0 text-accent" />
      <span className="readout text-[11px] uppercase tracking-wider">{restBlockText(seconds)}</span>
      <span className="flex-1" />
      <select
        value={seconds}
        aria-label="Rest length"
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-8 border border-input bg-secondary/40 px-2 text-xs text-foreground"
      >
        {choices.map((s) => (
          <option key={s} value={s}>
            {restBlockText(s).replace('Rest ', '')}
          </option>
        ))}
      </select>
      <button type="button" aria-label="Remove rest" onClick={onRemove} className="text-muted-foreground hover:text-destructive">
        <X size={14} />
      </button>
    </div>
  );
}

function Library({
  items,
  onAdd,
  onDragStart,
  onDragEnd,
  createCustomExercise,
}: {
  items: LibraryItem[];
  onAdd: (id: string) => void;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  createCustomExercise: Actions['createCustomExercise'];
}) {
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equipment, setEquipment] = useState('');
  const [sort, setSort] = useState<LibrarySort>('name');
  const [custom, setCustom] = useState(false);

  const muscles = useMemo(() => [...new Set(items.map((i) => i.musclePrimary))].sort(), [items]);
  const kit = useMemo(() => [...new Set(items.map((i) => i.equipment))].sort(), [items]);
  const shown = useMemo(
    () => filterLibrary(items, { q, muscle, equipment, sort }),
    [items, q, muscle, equipment, sort]
  );

  const select = 'h-10 min-w-0 flex-1 border border-input bg-secondary/40 px-2 text-sm text-foreground';

  return (
    <div className="flex flex-col gap-3 px-4 py-5 sm:px-6">
      <div className="flex items-center justify-between gap-2">
        <span className="readout text-[11px] uppercase tracking-wider text-muted-foreground">
          Exercise library · {shown.length}
        </span>
        <button
          type="button"
          onClick={() => setCustom((c) => !c)}
          className="readout inline-flex items-center gap-1 text-[11px] uppercase text-accent hover:underline"
        >
          <Plus size={13} /> Custom exercise
        </button>
      </div>

      {custom && (
        <CustomExerciseForm
          muscles={muscles}
          kit={kit}
          onCancel={() => setCustom(false)}
          create={async (input) => {
            const res = await createCustomExercise(input);
            if (res.ok) setCustom(false);
            return res;
          }}
        />
      )}

      <label className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search exercises"
          className={cn(field, 'h-11 pl-9')}
        />
      </label>
      <div className="flex gap-2">
        <select value={muscle} onChange={(e) => setMuscle(e.target.value)} className={select} aria-label="Muscle">
          <option value="">All muscles</option>
          {muscles.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select value={equipment} onChange={(e) => setEquipment(e.target.value)} className={select} aria-label="Equipment">
          <option value="">All equipment</option>
          {kit.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as LibrarySort)}
          className={cn(select, 'max-w-[7rem] flex-none')}
          aria-label="Sort"
        >
          <option value="name">A–Z</option>
          <option value="muscle">Muscle</option>
        </select>
      </div>

      {shown.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Nothing matches. Try fewer words, or add it as a custom exercise.
        </p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {shown.slice(0, 300).map((it) => (
            <li key={it.id}>
              <button
                type="button"
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', it.id);
                  e.dataTransfer.effectAllowed = 'copy';
                  onDragStart(it.id);
                }}
                onDragEnd={onDragEnd}
                onClick={() => onAdd(it.id)}
                title={`Add ${it.name}`}
                className="group flex w-full flex-col border border-border bg-card text-left transition-colors hover:border-accent/60"
              >
                <Thumb src={it.thumb} muscle={it.musclePrimary} className="aspect-video w-full border-0 border-b" />
                <span className="flex items-start justify-between gap-1 p-2">
                  <span className="flex min-w-0 flex-col">
                    <span className="line-clamp-2 text-xs font-medium leading-snug">{it.name}</span>
                    <span className="readout mt-0.5 truncate text-[9px] uppercase text-muted-foreground">
                      {it.musclePrimary} · {it.equipment}
                    </span>
                  </span>
                  <Plus size={14} className="mt-0.5 shrink-0 text-muted-foreground group-hover:text-accent" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {shown.length > 300 && (
        <p className="text-center text-xs text-muted-foreground">Showing 300 — search or filter to narrow it down.</p>
      )}
    </div>
  );
}

function CustomExerciseForm({
  muscles,
  kit,
  create,
  onCancel,
}: {
  muscles: string[];
  kit: string[];
  create: Actions['createCustomExercise'];
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [muscle, setMuscle] = useState('');
  const [equip, setEquip] = useState('');
  const [video, setVideo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="flex flex-col gap-2 border border-accent/40 bg-accent/[0.04] p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await create({ name, musclePrimary: muscle, equipment: equip, videoUrl: video });
        setBusy(false);
        if (!res.ok) setError(res.message ?? 'That did not save.');
      }}
    >
      <span className="readout text-[10px] uppercase tracking-wider text-accent">New custom exercise</span>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" required maxLength={120} className={field} />
      <div className="flex gap-2">
        <input
          value={muscle}
          onChange={(e) => setMuscle(e.target.value)}
          placeholder="Primary muscle"
          list="builder-muscles"
          required
          maxLength={60}
          className={field}
        />
        <input
          value={equip}
          onChange={(e) => setEquip(e.target.value)}
          placeholder="Equipment"
          list="builder-kit"
          required
          maxLength={60}
          className={field}
        />
      </div>
      <datalist id="builder-muscles">
        {muscles.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <datalist id="builder-kit">
        {kit.map((m) => (
          <option key={m} value={m} />
        ))}
      </datalist>
      <input
        value={video}
        onChange={(e) => setVideo(e.target.value)}
        placeholder="Demo video link (optional, YouTube or Vimeo)"
        inputMode="url"
        className={field}
      />
      {error && <p className="text-xs text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={busy}>
          {busy ? 'Adding…' : 'Create and add'}
        </Button>
      </div>
    </form>
  );
}
