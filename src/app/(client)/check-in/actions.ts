'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireEntitledClient } from '@/lib/auth';
import { CHECK_IN_QUESTIONS, weekOfFor, formatWeek, type CheckInAnswers } from '@/lib/check-in';
import { notifyCoach, displayName } from '@/lib/notifications';

export async function submitCheckIn(formData: FormData) {
  const user = await requireEntitledClient();
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

  const week = weekOfFor(user);
  const existing = await prisma.checkIn.findFirst({
    where: { clientId: user.id, weekOf: week },
  });

  /*
    One check-in per week — submitting again replaces it rather than stacking,
    so the coach never has to guess which one is current. That was the rule and
    find-then-insert was the mechanism, with no constraint behind it: two
    submits a moment apart both missed the read, both inserted, and the coach
    got two check-ins and two notifications for one week with the adherence
    number reading whichever it happened to find.

    The read above stays, but only to decide whether to announce it. Losing
    that race now means one extra notification rather than a duplicate row.
  */
  await prisma.checkIn.upsert({
    where: { clientId_weekOf: { clientId: user.id, weekOf: week } },
    create: { clientId: user.id, weekOf: week, answersJson: answers },
    update: { answersJson: answers, submittedAt: new Date() },
  });

  // Only announce the first submission of a week — editing your own answers
  // shouldn't ping the coach again and again.
  if (!existing) {
    const name = await displayName(user.id);
    await notifyCoach(user.id, 'check_in', `${name} sent their check-in for ${formatWeek(week)}`);
  }

  revalidatePath('/check-in');
  revalidatePath('/progress');
  redirect('/check-in?saved=1');
}
