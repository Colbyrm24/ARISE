'use client';

import { useState } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import { Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { balancedMacros } from '@/lib/macros';
import { cn } from '@/lib/utils';
import type { SetupState } from '@/app/coach/clients/[id]/setup-actions';

/*
  Set a client up in one go: program, calories, meals — one press.

  Everything is labelled above its box in readable type, because this is the
  screen he fills in most and a placeholder disappears the moment there's a
  number in the field.
*/

const field =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-3 text-base text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
const label = 'text-sm font-semibold text-foreground';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
      <Zap size={16} /> {pending ? 'Setting them up…' : 'Set them up'}
    </Button>
  );
}

type Target = { calories: number; protein: number; carbs: number; fat: number } | null;

export function QuickSetupForm({
  action,
  clientId,
  programs,
  defaultStart,
  current,
  copySources,
  hasPlan,
}: {
  action: (prev: SetupState, formData: FormData) => Promise<SetupState>;
  clientId: string;
  programs: { id: string; name: string }[];
  defaultStart: string;
  current: Target;
  copySources: { id: string; name: string }[];
  hasPlan: boolean;
}) {
  const [state, formAction] = useFormState(action, { ok: false, message: '' });
  const [templateId, setTemplateId] = useState('');
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  function onCalories(v: string) {
    setCalories(v);
    const s = balancedMacros(Number(v));
    if (!s) return;
    setProtein(String(s.protein));
    setCarbs(String(s.carbs));
    setFat(String(s.fat));
  }

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <input type="hidden" name="clientId" value={clientId} />

      {/* 1 · Training */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">1 · Training</legend>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 sm:col-span-1">
            <span className={label}>Program</span>
            <select
              name="templateId"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className={field}
            >
              <option value="">Keep as is</option>
              {programs.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label className={cn('flex flex-col gap-1.5', !templateId && 'opacity-50')}>
            <span className={label}>Starts</span>
            <input name="startDate" type="date" defaultValue={defaultStart} disabled={!templateId} className={field} />
          </label>
          <label className={cn('flex flex-col gap-1.5', !templateId && 'opacity-50')}>
            <span className={label}>Length</span>
            <select name="weeks" defaultValue="26" disabled={!templateId} className={field}>
              <option value="4">4 weeks</option>
              <option value="8">8 weeks</option>
              <option value="12">12 weeks</option>
              <option value="26">6 months</option>
              <option value="52">1 year</option>
            </select>
          </label>
        </div>
      </fieldset>

      {/* 2 · Calories */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">2 · Calories</legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <label className="flex flex-col gap-1.5">
            <span className={label}>Calories</span>
            <input
              name="calories"
              type="number"
              min="0"
              inputMode="numeric"
              placeholder={current ? String(current.calories) : 'e.g. 2400'}
              value={calories}
              onChange={(e) => onCalories(e.target.value)}
              className={field}
            />
          </label>
          {(
            [
              ['protein', 'Protein (g)', protein, setProtein],
              ['carbs', 'Carbs (g)', carbs, setCarbs],
              ['fat', 'Fat (g)', fat, setFat],
            ] as const
          ).map(([name, text, value, set]) => (
            <label key={name} className="flex flex-col gap-1.5">
              <span className={label}>{text}</span>
              <input
                name={name}
                type="number"
                min="0"
                step="0.1"
                inputMode="decimal"
                placeholder={current ? String(current[name]) : ''}
                value={value}
                onChange={(e) => set(e.target.value)}
                className={field}
              />
            </label>
          ))}
        </div>
        <p className="text-sm text-foreground/70">
          {current
            ? `Now: ${current.calories.toLocaleString('en-US')} cal · ${current.protein}p · ${current.carbs}c · ${current.fat}f. Leave blank to keep it.`
            : 'Type calories and the macros fill in. Type over any of them to change it.'}
        </p>
      </fieldset>

      {/* 3 · Meals */}
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wider text-accent">3 · Meals</legend>
        <label className="flex flex-col gap-1.5">
          <span className={label}>Meal plan</span>
          <select name="meals" defaultValue={hasPlan ? 'keep' : 'standard'} className={field}>
            {hasPlan && <option value="keep">Keep their current plan</option>}
            {hasPlan && <option value="resize">Keep it, resized to their calories</option>}
            <option value="standard">Standard plan, sized to their calories</option>
            {copySources.length > 0 && (
              <optgroup label="Copy another client's plan (resized)">
                {copySources.map((c) => (
                  <option key={c.id} value={`copy:${c.id}`}>
                    {c.name}
                  </option>
                ))}
              </optgroup>
            )}
            {!hasPlan && <option value="keep">No meal plan for now</option>}
          </select>
        </label>
        <p className="text-sm text-foreground/70">
          Sizing is done in servings (¾, 1¼…) so every meal stays a real recipe.
        </p>
      </fieldset>

      <label className="flex items-center gap-3 text-base text-foreground">
        <input type="checkbox" name="tell" defaultChecked className="h-5 w-5" />
        Notify them when it&apos;s done
      </label>

      <Submit />

      {state.message && (
        <p
          role="status"
          className={cn(
            'rounded-xl border px-4 py-3 text-base font-medium',
            state.ok ? 'border-success/40 bg-success/10 text-success' : 'border-destructive/40 bg-destructive/10 text-destructive'
          )}
        >
          {state.message}
        </p>
      )}
    </form>
  );
}
