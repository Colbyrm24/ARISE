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

  /*
    One row per day, now actually enforced.

    The docstring above has always said this, and the mechanism was
    find-then-insert with no constraint behind it. The reason that mattered
    here rather than anywhere else: there is a SECOND writer. The client's
    Apple Health automation posts the same morning's reading independently, so
    a 7am tap while the phone was posting had both miss the check and both
    insert — the rolling average then counted the day twice (exactly what the
    docstring says it exists to prevent), "latest" became whichever of the two,
    and Remove deleted only one so the client could not clear it.
  */
  const date = todayFor(user);
  await prisma.weightLog.upsert({
    where: { clientId_date: { clientId: user.id, date } },
    create: { clientId: user.id, date, weight },
    update: { weight },
  });

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

  // Same shape, same fix as logWeight above.
  const date = todayFor(user);
  await prisma.measurement.upsert({
    where: { clientId_date_type: { clientId: user.id, date, type } },
    create: { clientId: user.id, date, type, value },
    update: { value },
  });

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
