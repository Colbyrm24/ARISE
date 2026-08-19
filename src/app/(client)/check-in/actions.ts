'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { CHECK_IN_QUESTIONS, weekOf, type CheckInAnswers } from '@/lib/check-in';

export async function submitCheckIn(formData: FormData) {
  const user = await requireClient();
  const answers: CheckInAnswers = {};

  for (const q of CHECK_IN_QUESTIONS) {
    const raw = formData.get(q.key);
    if (typeof raw !== 'string') continue;

    if (q.type === 'scale') {
      const n = Number(raw);
      if (Number.isFinite(n) && n >= 1 && n <= 10) answers[q.key] = n;
    } else {
      const trimmed = raw.trim().slice(0, 2000);
      if (trimmed) answers[q.key] = trimmed;
    }
  }

  if (Object.keys(answers).length === 0) return;

  const week = weekOf();
  const existing = await prisma.checkIn.findFirst({
    where: { clientId: user.id, weekOf: week },
  });

  // One check-in per week — submitting again replaces it rather than
  // stacking, so the coach never has to guess which one is current.
  if (existing) {
    await prisma.checkIn.update({
      where: { id: existing.id },
      data: { answersJson: answers, submittedAt: new Date() },
    });
  } else {
    await prisma.checkIn.create({
      data: { clientId: user.id, weekOf: week, answersJson: answers },
    });
  }

  revalidatePath('/check-in');
  revalidatePath('/progress');
  redirect('/check-in?saved=1');
}
