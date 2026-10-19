'use server';

import { revalidatePath } from 'next/cache';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { moveItem, removeItem, setDay, shiftFrom, type EditResult } from '@/lib/schedule-edit';

/*
  The calendar's edits, as server actions.

  Called straight from the drag-and-drop board rather than through forms, so
  each takes plain arguments. Every one re-checks that this coach owns this
  client — a server action is a public endpoint the moment it exists, and the
  layout's ownership check guards the page, not the action.
*/

async function guard(clientId: string): Promise<EditResult | null> {
  const coach = await requireCoach();
  if (!clientId || !(await coachOwnsClient(coach.id, clientId))) {
    return { ok: false, message: 'That client is not yours.' };
  }
  return null;
}

function refresh(clientId: string) {
  revalidatePath(`/coach/clients/${clientId}/calendar`);
  revalidatePath(`/coach/clients/${clientId}`);
  // The client's own screens read the same rows.
  revalidatePath('/today');
  revalidatePath('/calendar');
}

async function run(clientId: string, edit: () => Promise<EditResult>): Promise<EditResult> {
  const denied = await guard(clientId);
  if (denied) return denied;
  try {
    const result = await edit();
    if (result.ok) refresh(clientId);
    return result;
  } catch (err) {
    console.error('Calendar edit failed', {
      clientId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: 'That did not save. Try again.' };
  }
}

export async function moveSession(clientId: string, itemId: string, to: string) {
  return run(clientId, () => moveItem(clientId, itemId, to));
}

export async function removeSession(clientId: string, itemId: string) {
  return run(clientId, () => removeItem(clientId, itemId));
}

export async function setDaySession(clientId: string, day: string, workoutId: string | null) {
  return run(clientId, () =>
    setDay(clientId, day, workoutId ? { kind: 'workout', workoutId } : { kind: 'rest' })
  );
}

export async function pushBack(clientId: string, from: string, days: number) {
  return run(clientId, () => shiftFrom(clientId, from, days));
}
