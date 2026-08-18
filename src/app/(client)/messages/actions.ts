'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';

/**
 * A client only ever talks to their own coach. We resolve the coach from
 * coach_client_relationships rather than letting the browser name a
 * recipient — otherwise a client could message anyone by id.
 */
async function coachIdForClient(clientId: string) {
  const rel = await prisma.coachClientRelationship.findFirst({
    where: { clientId, status: 'active' },
    orderBy: { assignedAt: 'desc' },
  });
  return rel?.coachId ?? null;
}

export async function sendMessageToCoach(formData: FormData) {
  const user = await requireClient();
  const body = (formData.get('body') as string | null)?.trim();
  if (!body) return;

  const coachId = await coachIdForClient(user.id);
  if (!coachId) return;

  await prisma.message.create({
    data: { senderId: user.id, recipientId: coachId, body },
  });

  revalidatePath('/messages');
}

/** Marks everything the coach sent this client as read. */
export async function markCoachMessagesRead() {
  const user = await requireClient();
  await prisma.message.updateMany({
    where: { recipientId: user.id, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/messages');
}
