'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { isHabitType } from '@/lib/habits';
import { notify } from '@/lib/notifications';

/*
  The coach's side of daily habits.

  DailyGoal had no write path at all, which is why every client's Today screen
  said their coach hadn't set any goals — true, and impossible to change.
*/

function refresh(clientId: string) {
  revalidatePath(`/coach/clients/${clientId}`);
  revalidatePath('/today');
}

export async function addHabit(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const goalType = ((formData.get('goalType') as string | null) ?? '').trim();
  const rawTarget = ((formData.get('targetValue') as string | null) ?? '').trim().slice(0, 80);
  if (!clientId || !isHabitType(goalType)) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  // A custom habit with no description would render as the word "Habit" and
  // tell the client nothing, so it isn't worth creating.
  if (goalType === 'custom' && !rawTarget) return;

  // One row per habit type per client, except custom — a client can have
  // several of those and they're told apart by their text.
  if (goalType !== 'custom') {
    const existing = await prisma.dailyGoal.findFirst({
      where: { clientId, goalType, active: true },
    });
    if (existing) {
      await prisma.dailyGoal.update({
        where: { id: existing.id },
        data: { targetValue: rawTarget || null },
      });
      refresh(clientId);
      return;
    }
  }

  await prisma.dailyGoal.create({
    data: { clientId, goalType, targetValue: rawTarget || null, active: true },
  });

  await notify(clientId, 'habit', 'Your coach added a daily habit.');
  refresh(clientId);
}

/**
 * Retires a habit rather than deleting it.
 *
 * The logs point at this row, and they're the client's history — a month of
 * hitting their water every day should not evaporate because the habit was
 * swapped out in week five.
 */
export async function retireHabit(formData: FormData) {
  const coach = await requireCoach();

  const goalId = formData.get('goalId') as string | null;
  if (!goalId) return;

  const goal = await prisma.dailyGoal.findUnique({ where: { id: goalId } });
  if (!goal) return;
  if (!(await coachOwnsClient(coach.id, goal.clientId))) return;

  await prisma.dailyGoal.update({ where: { id: goalId }, data: { active: false } });
  refresh(goal.clientId);
}

/**
 * Sets a client's step target and, when the coach has a figure to hand, today's
 * steps as well.
 *
 * Coaches get step counts by text constantly ("8-10k a day"), and until now
 * there was nowhere to put one: StepLog was read by the Today screen and
 * written by nothing, so a steps habit could never complete.
 */
export async function setSteps(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const raw = (formData.get('steps') as string | null)?.trim();
  if (!clientId || !raw) return;
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  const steps = Number(raw);
  if (!Number.isFinite(steps) || steps < 0) return;

  const date = new Date();
  date.setHours(0, 0, 0, 0);

  await prisma.stepLog.upsert({
    where: { clientId_date: { clientId, date } },
    create: { clientId, date, steps: Math.round(Math.min(steps, 200000)), source: 'manual' },
    update: { steps: Math.round(Math.min(steps, 200000)), source: 'manual' },
  });
  refresh(clientId);
}
