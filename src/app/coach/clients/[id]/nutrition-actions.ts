'use server';

import { revalidatePath } from 'next/cache';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient } from '@/lib/coach-guard';
import { writeTarget } from '@/lib/client-setup';

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
    Effective from the CLIENT's today, and upserted so re-saving a typo on the
    same day replaces it rather than leaving two rows to disagree. Both live
    in writeTarget now, which the one-screen setup shares.
  */
  await writeTarget(clientId, { calories, protein, carbs, fat });

  revalidatePath(`/coach/clients/${clientId}`);
}
