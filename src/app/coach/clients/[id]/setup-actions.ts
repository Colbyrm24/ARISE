'use server';

import { revalidatePath } from 'next/cache';
import { requireCoach } from '@/lib/auth';
import { coachOwnsClient, coachOwnsTemplate } from '@/lib/coach-guard';
import { DEFAULT_WEEKS, MAX_WEEKS } from '@/lib/program-deploy';
import { subscribeClient } from '@/lib/program-subscribers';
import { isDayKey, keyToDate } from '@/lib/schedule-move';
import { assignOptionPlan } from '@/lib/recipe-seed';
import { copyPlan, resizeActivePlan, writeTarget } from '@/lib/client-setup';
import { notify } from '@/lib/notifications';

export type SetupState = { ok: boolean; message: string };

/*
  One screen, one press: training, calories and meals.

  Setting somebody up used to be three cards and three tabs — start the
  program here, type the target there, then go to Meals and build a plan that
  didn't know what the target was. Each piece is still optional: leave a part
  on "keep" and it is left exactly as it is.

  The meal plan is written AFTER the target, so it is sized to the number
  that was just set rather than the one being replaced.
*/
export async function quickSetup(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const coach = await requireCoach();
  const clientId = (formData.get('clientId') as string | null) ?? '';
  if (!clientId || !(await coachOwnsClient(coach.id, clientId))) {
    return { ok: false, message: 'That client is not yours.' };
  }

  const done: string[] = [];

  // ---- Training ----
  const templateId = ((formData.get('templateId') as string | null) ?? '').trim();
  if (templateId) {
    if (!(await coachOwnsTemplate(coach.id, templateId))) {
      return { ok: false, message: 'That program is not yours.' };
    }
    const raw = (formData.get('startDate') as string | null) ?? '';
    if (!isDayKey(raw)) return { ok: false, message: 'Pick a start date.' };
    const weeksRaw = Number(formData.get('weeks'));
    const weeks =
      Number.isInteger(weeksRaw) && weeksRaw >= 1 && weeksRaw <= MAX_WEEKS ? weeksRaw : DEFAULT_WEEKS;
    const result = await subscribeClient(clientId, templateId, keyToDate(raw), weeks);
    if (result.created === 0) {
      return { ok: false, message: "That program's week is empty. Open it and set each day first." };
    }
    done.push(`${result.workoutDays} sessions on their calendar`);
    revalidatePath(`/coach/programs/${templateId}`);
  }

  // ---- Calories ----
  const calRaw = ((formData.get('calories') as string | null) ?? '').trim();
  if (calRaw) {
    const t = {
      calories: Number(calRaw),
      protein: Number(formData.get('protein')),
      carbs: Number(formData.get('carbs')),
      fat: Number(formData.get('fat')),
    };
    const valid =
      Number.isFinite(t.calories) &&
      t.calories > 0 &&
      t.calories <= 10000 &&
      [t.protein, t.carbs, t.fat].every((n) => Number.isFinite(n) && n >= 0);
    if (!valid) return { ok: false, message: 'Check the calorie and macro numbers.' };
    await writeTarget(clientId, t);
    done.push(`${t.calories.toLocaleString('en-US')} cal target`);
  }

  // ---- Meals ----
  const meals = ((formData.get('meals') as string | null) ?? 'keep').trim();
  if (meals === 'standard') {
    const r = await assignOptionPlan(coach.id, clientId, calRaw ? Number(calRaw) : undefined);
    done.push(`standard meal plan (~${r.day.toLocaleString('en-US')} cal a day)`);
  } else if (meals === 'resize') {
    const r = await resizeActivePlan(clientId);
    if (r) done.push(`meal plan resized (~${r.day.toLocaleString('en-US')} cal a day)`);
  } else if (meals.startsWith('copy:')) {
    const from = meals.slice(5);
    if (from === clientId || !(await coachOwnsClient(coach.id, from))) {
      return { ok: false, message: 'Pick one of your clients to copy from.' };
    }
    const r = await copyPlan(coach.id, from, clientId);
    if (!r) return { ok: false, message: 'That client has no meal plan to copy.' };
    done.push(`"${r.name}" copied (~${r.day.toLocaleString('en-US')} cal a day)`);
  }

  if (done.length === 0) return { ok: false, message: 'Nothing to change — pick at least one thing.' };

  if (formData.get('tell') === 'on') {
    await notify(clientId, 'nutrition', 'Your coach just set up your plan. Open the app to see it.');
    done.push('they were notified');
  }

  for (const path of [
    `/coach/clients/${clientId}`,
    `/coach/clients/${clientId}/calendar`,
    `/coach/clients/${clientId}/meals`,
    '/nutrition',
    '/today',
  ]) {
    revalidatePath(path);
  }

  return { ok: true, message: `Done: ${done.join(' · ')}.` };
}
