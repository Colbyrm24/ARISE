'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { REST_DAY } from '@/lib/auto-message';

/**
 * Rest-day messages, edited as one block of text — one line per message.
 *
 * A textarea rather than a row of inputs with add and delete buttons: there
 * are five of these, they are one or two sentences each, and the fastest way
 * to rewrite them is to see them all at once and type. The rotation order is
 * the order they appear in.
 */
export async function saveRestDayMessages(formData: FormData) {
  const coach = await requireCoach();

  const raw = (formData.get('messages') as string | null) ?? '';
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 500)
    .slice(0, 20);

  // Replaced wholesale rather than diffed. These are five short lines with no
  // history worth preserving, and matching them up by content would mean an
  // edited line reads as a delete plus an insert anyway.
  await prisma.$transaction([
    prisma.autoMessage.deleteMany({ where: { coachId: coach.id, trigger: REST_DAY } }),
    prisma.autoMessage.createMany({
      data: lines.map((body, position) => ({
        coachId: coach.id,
        trigger: REST_DAY,
        body,
        position,
      })),
    }),
  ]);

  revalidatePath('/coach/settings');
}
