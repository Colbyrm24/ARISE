'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { todayFor } from '@/lib/day';

/** Sets a new calorie/macro target for a client, effective today. */
export async function setNutritionTarget(formData: FormData) {
  const coach = await requireCoach();

  const clientId = formData.get('clientId') as string | null;
  const calories = Number(formData.get('calories'));
  const protein = Number(formData.get('protein'));
  const carbs = Number(formData.get('carbs'));
  const fat = Number(formData.get('fat'));
  /*
    Calories must be positive, not merely finite.

    A zero calorie target is never a real coaching decision, and it is
    divided by in several places — the client's Today bars turned an eaten
    figure into Infinity and rendered a full bar, and `flagFor` returns null
    for the whole day so the meals queue silently stops judging anything.
    Macros are allowed to be zero: a coach setting calories and protein and
    leaving carbs open is a real thing.
  */
  if (
    !clientId ||
    !Number.isFinite(calories) ||
    calories <= 0 ||
    !Number.isFinite(protein) ||
    protein < 0 ||
    !Number.isFinite(carbs) ||
    carbs < 0 ||
    !Number.isFinite(fat) ||
    fat < 0
  ) {
    return;
  }
  if (!(await coachOwnsClient(coach.id, clientId))) return;

  /*
    Effective from the CLIENT's today, not the coach's. He sets numbers at
    9pm Eastern for a client in Los Angeles; that client is still mid-
    afternoon, and stamping tomorrow would leave them eating to the old
    target for the rest of a day they think has already changed.
  */
  const client = await prisma.user.findUnique({
    where: { id: clientId },
    select: { profile: { select: { timezone: true } } },
  });

  await prisma.nutritionTarget.create({
    data: { clientId, calories, protein, carbs, fat, effectiveDate: todayFor(client) },
  });

  revalidatePath(`/coach/clients/${clientId}`);
}
