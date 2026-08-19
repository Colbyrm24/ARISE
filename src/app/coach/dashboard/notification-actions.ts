'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';

/** Clears the coach's own unread notifications. Scoped to auth.uid, never an id from the form. */
export async function markAllNotificationsRead() {
  const coach = await requireCoach();

  await prisma.notification.updateMany({
    where: { userId: coach.id, readAt: null },
    data: { readAt: new Date() },
  });

  revalidatePath('/coach/dashboard');
}
