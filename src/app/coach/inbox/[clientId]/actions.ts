'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';

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

  revalidatePath(`/coach/inbox/${clientId}`);
  revalidatePath('/coach/inbox');
}

export async function markClientMessagesRead(coachId: string, clientId: string) {
  await prisma.message.updateMany({
    where: { senderId: clientId, recipientId: coachId, readAt: null },
    data: { readAt: new Date() },
  });
  revalidatePath('/coach/inbox');
}
