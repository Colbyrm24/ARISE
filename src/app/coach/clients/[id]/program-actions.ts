'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient, coachOwnsTemplate } from '@/lib/coach-guard';
import { DEFAULT_WEEKS, MAX_WEEKS } from '@/lib/program-deploy';
import { subscribeClient } from '@/lib/program-subscribers';
import { isDayKey, keyToDate } from '@/lib/schedule-move';

export type StartProgramState = { ok: boolean; message: string };

/**
 * Put a client on a program in one step: pick it, pick a start date, done.
 *
 * Assigning a program used to only set a label. Nothing went on the client's
 * calendar until the coach also went to the program builder, found the Deploy
 * box, picked the same client again and pressed a second button — so the
 * client's Today screen stayed empty and the obvious-looking button on their
 * profile did nothing they could see. This does both: writes the dated
 * sessions and makes it their active program.
 *
 * Starting a new program over an old one replaces every unfinished session
 * from the start date forward and leaves the past alone, so switching
 * programs mid-block is the same button.
 */
export async function startProgram(
  _prev: StartProgramState,
  formData: FormData
): Promise<StartProgramState> {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const templateId = formData.get('templateId') as string | null;
  if (!clientId || !templateId) return { ok: false, message: 'Pick a program first.' };
  if (!(await coachOwnsClient(coach.id, clientId))) {
    return { ok: false, message: 'That client is not yours.' };
  }
  if (!(await coachOwnsTemplate(coach.id, templateId))) {
    return { ok: false, message: 'That program is not yours.' };
  }

  // "2026-10-19" from a date input, read as that calendar day. Refused rather
  // than defaulted when unreadable: guessing "today" on the server is UTC, and
  // from 8pm Eastern that is tomorrow — the whole block a day late.
  const raw = (formData.get('startDate') as string | null) ?? '';
  if (!isDayKey(raw)) return { ok: false, message: 'Pick a start date.' };

  const weeksRaw = Number(formData.get('weeks'));
  const weeks = Number.isInteger(weeksRaw) && weeksRaw >= 1 && weeksRaw <= MAX_WEEKS ? weeksRaw : DEFAULT_WEEKS;

  // The same path as the program's Add subscribers, so a client started from
  // here shows up on its subscriber list with this start date, linked.
  const result = await subscribeClient(clientId, templateId, keyToDate(raw), weeks);
  if (result.created === 0) {
    return {
      ok: false,
      message: "That program's week is empty. Open it and set what each day is first.",
    };
  }

  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath(`/coach/clients/${clientId}/calendar`);
  revalidatePath(`/coach/programs/${templateId}`);

  const through = result.to.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
  return {
    ok: true,
    message: `On the calendar through ${through} — ${result.workoutDays} sessions, ${result.restDays} rest days. Open Calendar to move any of them.`,
  };
}

/**
 * Taking a client off their program. Retires the assignment rather than
 * deleting it, so past programs stay in history. Putting someone ON a program
 * is startProgram above — assigning without writing the calendar used to be
 * its own button, and it left the client with nothing to do.
 */
export async function unassignProgram(formData: FormData) {
  const coach = await requireCoach();

  const clientProgramId = formData.get('clientProgramId') as string | null;
  const clientId = formData.get('clientId') as string | null;
  if (!clientProgramId || !clientId) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  // Scoped by clientId too, so a program id belonging to another client
  // can't be retired through this client's form.
  await prisma.clientProgram.updateMany({
    where: { id: clientProgramId, clientId },
    data: { active: false },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}
