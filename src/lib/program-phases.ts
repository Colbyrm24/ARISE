import { prisma } from '@/lib/prisma';
import { implicitPhase, IMPLICIT_PHASE_ID } from '@/lib/program-calendar';

/*
  A program's phases, as the screens read them and as the actions write them.

  Every template built before phases existed has none, and they must still
  open and work. Two ways to get there: backfill a "Phase 1" row for every
  template, or treat "no rows" as one implicit phase. This takes the second,
  and only writes the row the first time the coach actually edits a phase or
  adds the next one:

  - Opening a program never writes. A page view that silently creates rows is
    how two tabs opened at once end up with two Phase 1s.
  - Nothing has to be run against existing data, so a template that is never
    touched again stays byte-for-byte what it was — which matters for the
    Follow My Split templates, whose members are deployed from them daily.
  - Workouts with no phase_id read as the first phase's, so creating the row
    later needs no workout updates either.
*/

export type PhaseRow = { id: string; name: string; weeks: number; summary: string | null; position: number };

/** The phases to show: real rows, or the one implicit phase. Never writes. */
export async function readPhases(templateId: string, items?: { dayIndex: number }[]): Promise<PhaseRow[]> {
  const rows = await prisma.programPhase.findMany({
    where: { templateId },
    orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    select: { id: true, name: true, weeks: true, summary: true, position: true },
  });
  if (rows.length > 0) return rows;
  const calendar =
    items ??
    (await prisma.programCalendarItem.findMany({ where: { templateId }, select: { dayIndex: true } }));
  return [{ ...implicitPhase(calendar), position: 0 }];
}

/**
 * The real phase rows, creating the first one from the implicit phase if the
 * template has none yet. Called by every action that writes a phase.
 */
export async function ensurePhases(templateId: string): Promise<PhaseRow[]> {
  const shown = await readPhases(templateId);
  if (shown[0]?.id !== IMPLICIT_PHASE_ID) return shown;
  const first = shown[0];
  const created = await prisma.programPhase.create({
    data: { templateId, name: first.name, weeks: first.weeks, summary: first.summary, position: 0 },
    select: { id: true, name: true, weeks: true, summary: true, position: true },
  });
  return [created];
}

/**
 * Resolves a phase id from a form against this template — "implicit" means
 * the first phase, which is created if it doesn't exist yet. Null when the id
 * isn't one of this template's phases.
 */
export async function resolvePhase(templateId: string, phaseId: string | null | undefined) {
  if (!phaseId) return null;
  const phases = phaseId === IMPLICIT_PHASE_ID ? await ensurePhases(templateId) : await readPhases(templateId);
  const target = phaseId === IMPLICIT_PHASE_ID ? phases[0] : phases.find((p) => p.id === phaseId);
  if (!target || target.id === IMPLICIT_PHASE_ID) return null;
  return { phase: target, phases };
}
