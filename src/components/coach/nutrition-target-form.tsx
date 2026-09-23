'use client';

import { useState } from 'react';
import { useFormStatus } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { balancedMacros } from '@/lib/macros';

/*
  Calories first, everything else follows.

  This was four required boxes and the coach did the arithmetic himself for
  every client, every time he changed a number. Now the calorie box drives the
  other three: type 2400 and protein, carbs and fat fill in as he types.

  They stay ordinary editable fields. Anything he types over the top sticks —
  a client who needs 200g of protein at 2400 calories is a real case, and the
  split is a starting point rather than a rule. Moving calories again
  recalculates all three, because at that point the old grams belong to a
  target that no longer exists.
*/

type Current = { calories: number; protein: number; carbs: number; fat: number } | null;

function num(value: number | undefined | null) {
  return value === undefined || value === null ? '' : String(value);
}

/*
  Separate because useFormStatus only reports on a form ABOVE it in the tree —
  read from inside the same component that renders the <form> it always says
  "not pending".
*/
function SaveButton({ existing }: { existing: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" variant="secondary" className="w-fit" disabled={pending}>
      {pending ? 'Saving…' : existing ? 'Update Target' : 'Set Target'}
    </Button>
  );
}

export function NutritionTargetForm({
  action,
  clientId,
  current,
}: {
  action: (formData: FormData) => Promise<void>;
  clientId: string;
  current: Current;
}) {
  const [calories, setCalories] = useState(num(current?.calories));
  const [protein, setProtein] = useState(num(current?.protein));
  const [carbs, setCarbs] = useState(num(current?.carbs));
  const [fat, setFat] = useState(num(current?.fat));

  function onCalories(value: string) {
    setCalories(value);

    const split = balancedMacros(Number(value));
    // Null means the box is empty or unreadable. Leave whatever is already in
    // the macro fields rather than wiping them while he clears and retypes.
    if (!split) return;

    setProtein(String(split.protein));
    setCarbs(String(split.carbs));
    setFat(String(split.fat));
  }

  return (
    <form action={action} className="flex flex-col gap-2">
      <input type="hidden" name="clientId" value={clientId} />
      <div className="grid grid-cols-2 gap-2">
        <Input
          name="calories"
          type="number"
          min="0"
          placeholder="Calories"
          required
          value={calories}
          onChange={(e) => onCalories(e.target.value)}
        />
        <Input
          name="protein"
          type="number"
          step="0.1"
          min="0"
          placeholder="Protein (g)"
          required
          value={protein}
          onChange={(e) => setProtein(e.target.value)}
        />
        <Input
          name="carbs"
          type="number"
          step="0.1"
          min="0"
          placeholder="Carbs (g)"
          required
          value={carbs}
          onChange={(e) => setCarbs(e.target.value)}
        />
        <Input
          name="fat"
          type="number"
          step="0.1"
          min="0"
          placeholder="Fat (g)"
          required
          value={fat}
          onChange={(e) => setFat(e.target.value)}
        />
      </div>
      <p className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">
        Macros fill in from the calories. Type over any of them to change it.
      </p>
      <SaveButton existing={Boolean(current)} />
    </form>
  );
}
