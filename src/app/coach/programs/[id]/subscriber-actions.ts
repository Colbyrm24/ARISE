'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient, coachOwnsTemplate } from '@/lib/coach-guard';
import { isDayKey, keyToDate } from '@/lib/schedule-move';
import { removeSubscription, resyncTemplate, setLinked, subscribeClient } from '@/lib/program-subscribers';

/*
  Summary & Subscribers: putting clients on a master program, taking them
  off, and unlinking one from it.

  Same guard shape as every coach action: requireCoach(), then the template
  must be this coach's and so must every client. A subscription id from the
  form is only ever used to look the row up; the client and template it
  acts on come from that row, and both are checked.
*/

export type SubscribeState = { ok: boolean; message: string };

const MAX_AT_ONCE = 50;

/** Add subscribers: one or more clients, one start date. */
export async function addSubscribers(_prev: SubscribeState, formData: FormData): Promise<SubscribeState> {
  const coach = await requireCoach();

  const templateId = formData.get('templateId') as string | null;
  if (!templateId || !(await coachOwnsTemplate(coach.id, templateId))) {
    return { ok: false, message: 'That program is not yours.' };
  }

  const clientIds = [...new Set(formData.getAll('clientId').map(String).filter(Boolean))].slice(0, MAX_AT_ONCE);
  if (clientIds.length === 0) return { ok: false, message: 'Pick at least one client.' };

  // "2026-11-02" from a date input, read as that calendar day. Refused rather
  // than defaulted: the server's "today" is UTC, a day ahead every evening.
  const raw = (formData.get('startDate') as string | null) ?? '';
  if (!isDayKey(raw)) return { ok: false, message: 'Pick a start date.' };
  const startDate = keyToDate(raw);

  let added = 0;
  let empty = false;
  const refused: string[] = [];
  for (const clientId of clientIds) {
    if (!(await coachOwnsClient(coach.id, clientId))) {
      refused.push(clientId);
      continue;
    }
    const result = await subscribeClient(clientId, templateId, startDate);
    if (result.created === 0) {
      empty = true;
      break;
    }
    added += 1;
    revalidatePath(`/coach/clients/${clientId}`);
  }

  revalidatePath(`/coach/programs/${templateId}`);
  revalidatePath('/coach/programs');

  if (empty && added === 0) {
    return {
      ok: false,
      message: 'Nothing to put on a calendar yet — the program calendar and the weekly pattern are both empty.',
    };
  }
  const parts = [`${added} subscriber${added === 1 ? '' : 's'} added, Day 1 on ${raw}.`];
  if (refused.length > 0) parts.push(`${refused.length} skipped — not your client.`);
  return { ok: added > 0, message: parts.join(' ') };
}

/** The subscription row behind a form, proven to be this coach's on both sides. */
async function ownedSubscription(formData: FormData) {
  const coach = await requireCoach();
  const id = (formData.get('subscriptionId') ?? formData.get('id')) as string | null;
  if (!id) return null;
  const row = await prisma.clientProgram.findUnique({
    where: { id },
    select: { id: true, clientId: true, templateId: true },
  });
  if (!row) return null;
  const [ownsTemplate, ownsClient] = await Promise.all([
    coachOwnsTemplate(coach.id, row.templateId),
    coachOwnsClient(coach.id, row.clientId),
  ]);
  return ownsTemplate && ownsClient ? row : null;
}

function refresh(row: { clientId: string; templateId: string }) {
  revalidatePath(`/coach/programs/${row.templateId}`);
  revalidatePath(`/coach/clients/${row.clientId}`);
  revalidatePath(`/coach/clients/${row.clientId}/calendar`);
  revalidatePath('/coach/programs');
}

/**
 * Remove: their future, unfinished, unpinned days from this program go, and
 * the subscription is retired. History stays.
 */
export async function removeSubscriber(formData: FormData) {
  const row = await ownedSubscription(formData);
  if (!row) return;
  await removeSubscription(row.clientId, row.templateId);
  refresh(row);
}

/** Unlink: keep every row they have, stop following the master. */
export async function unlinkSubscriber(formData: FormData) {
  const row = await ownedSubscription(formData);
  if (!row) return;
  await setLinked(row.clientId, row.templateId, false);
  refresh(row);
}

/**
 * Relink: follow the master again. Their future days are brought in line
 * straight away, by the same sync a master edit runs.
 */
export async function relinkSubscriber(formData: FormData) {
  const row = await ownedSubscription(formData);
  if (!row) return;
  await setLinked(row.clientId, row.templateId, true);
  await resyncTemplate(row.templateId);
  refresh(row);
}
