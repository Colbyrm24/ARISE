'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';


const MEASUREMENT_TYPES = ['waist', 'chest', 'arms', 'thighs', 'hips'] as const;

/**
 * One weigh-in per day. Logging again the same day overwrites rather than
 * stacking — people re-weigh, and two numbers for one morning would poison
 * the rolling average.
 */
export async function logWeight(formData: FormData) {
  const user = await requireClient();
  const raw = formData.get('weight') as string | null;
  const weight = raw ? Number(raw) : NaN;
  if (!Number.isFinite(weight) || weight <= 0 || weight > 1500) return;

  const date = todayFor(user);
  const existing = await prisma.weightLog.findFirst({ where: { clientId: user.id, date } });

  if (existing) {
    await prisma.weightLog.update({ where: { id: existing.id }, data: { weight } });
  } else {
    await prisma.weightLog.create({ data: { clientId: user.id, date, weight } });
  }

  revalidatePath('/progress');
  revalidatePath('/today');
}

export async function logMeasurement(formData: FormData) {
  const user = await requireClient();
  const type = formData.get('type') as string | null;
  const raw = formData.get('value') as string | null;
  const value = raw ? Number(raw) : NaN;
  if (!type || !MEASUREMENT_TYPES.includes(type as (typeof MEASUREMENT_TYPES)[number])) return;
  if (!Number.isFinite(value) || value <= 0 || value > 200) return;

  const date = todayFor(user);
  const existing = await prisma.measurement.findFirst({
    where: { clientId: user.id, date, type },
  });

  if (existing) {
    await prisma.measurement.update({ where: { id: existing.id }, data: { value } });
  } else {
    await prisma.measurement.create({ data: { clientId: user.id, date, type, value } });
  }

  revalidatePath('/progress');
}

export async function removeWeightLog(formData: FormData) {
  const user = await requireClient();
  const id = formData.get('logId') as string | null;
  if (!id) return;

  const log = await prisma.weightLog.findUnique({ where: { id } });
  if (!log || log.clientId !== user.id) return;

  await prisma.weightLog.delete({ where: { id } });
  revalidatePath('/progress');
  revalidatePath('/today');
}
