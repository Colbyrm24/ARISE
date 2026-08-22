'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Sets a new calorie/macro target for a client, effective today. */
export async function setNutritionTarget(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const calories = Number(formData.get('calories'));
  const protein = Number(formData.get('protein'));
  const carbs = Number(formData.get('carbs'));
  const fat = Number(formData.get('fat'));
  if (
    !clientId ||
    !Number.isFinite(calories) ||
    !Number.isFinite(protein) ||
    !Number.isFinite(carbs) ||
    !Number.isFinite(fat)
  ) {
    return;
  }
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  await prisma.nutritionTarget.create({
    data: { clientId, calories, protein, carbs, fat, effectiveDate: todayDateOnly() },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}
