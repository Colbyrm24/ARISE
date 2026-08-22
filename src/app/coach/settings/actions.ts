'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { TRIGGERS, type Trigger } from '@/lib/auto-message';

function isTrigger(v: string): v is Trigger {
  return (TRIGGERS as readonly string[]).includes(v);
}

/**
 * Automatic messages, edited as one block of text — one line per message.
 *
 * A textarea rather than a row of inputs with add and delete buttons: these
 * are a handful of one-line messages, and the fastest way to rewrite them is
 * to see them all at once and type. The rotation order is the order they
 * appear in.
 */
export async function saveAutoMessages(formData: FormData) {
  const coach = await requireCoach();

  const trigger = (formData.get('trigger') as string | null) ?? '';
  if (!isTrigger(trigger)) return;

  const raw = (formData.get('messages') as string | null) ?? '';
  const lines = raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && l.length <= 500)
    .slice(0, 20);

  // Replaced wholesale rather than diffed. These are short lines with no
  // history worth preserving, and matching them up by content would mean an
  // edited line reads as a delete plus an insert anyway.
  await prisma.$transaction([
    prisma.autoMessage.deleteMany({ where: { coachId: coach.id, trigger } }),
    prisma.autoMessage.createMany({
      data: lines.map((body, position) => ({ coachId: coach.id, trigger, body, position })),
    }),
  ]);

  revalidatePath('/coach/settings');
}

/**
 * Kept so the old single-purpose form keeps working if anything still posts
 * to it.
 */
export async function saveRestDayMessages(formData: FormData) {
  const fd = new FormData();
  fd.set('trigger', 'rest_day');
  fd.set('messages', (formData.get('messages') as string | null) ?? '');
  return saveAutoMessages(fd);
}
