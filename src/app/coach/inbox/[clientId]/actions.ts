'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { notify, displayName } from '@/lib/notifications';

/** Confirms this coach actually coaches this client before anything is written. */
async function assertOwns(coachId: string, clientId: string) {
  const rel = await prisma.coachClientRelationship.findFirst({
    where: { coachId, clientId, status: 'active' },
  });
  return Boolean(rel);
}

export async function sendMessageToClient(formData: FormData) {
  const coach = await requireCoach();
  const clientId = formData.get('clientId') as string | null;
  const body = (formData.get('body') as string | null)?.trim();
  if (!clientId || !body) return;
  if (!(await assertOwns(coach.id, clientId))) return;

  await prisma.message.create({
    data: { senderId: coach.id, recipientId: clientId, body },
  });

  const name = await displayName(coach.id);
  await notify(clientId, 'message', `${name}: ${body.slice(0, 80)}`);

  revalidatePath(`/coach/inbox/${clientId}`);
  revalidatePath('/coach/inbox');
}

/**
 * Marks a client's messages read.
 *
 * The coach id comes from the session, never from the caller. The old
 * signature took both ids as plain arguments with no auth check at all —
 * every 'use server' export is a public endpoint the moment it exists, so
 * anyone who knew the action id could mark arbitrary people's mail read.
 */
export async function markClientMessagesRead(clientId: string) {
  const coach = await requireCoach();
  if (!clientId) return;
  if (!(await assertOwns(coach.id, clientId))) return;

  await prisma.message.updateMany({
    where: { senderId: clientId, recipientId: coach.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/coach/inbox');
}
