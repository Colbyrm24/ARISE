import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ArrowLeft, Clock } from 'lucide-react';
import { requireEntitledClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';

/*
  How to actually make the meal.

  The plan already carried a recipe id on every line — the schema comment on
  MealPlanItem literally says it is "set when the line came from the library,
  so the client can open the full recipe" — and all 42 lines on the live plan
  have one. There was simply no screen at the other end of it. Ninety recipes
  with ingredients, method and timings sat in the database and no client could
  ever read a single one, so the plan was a list of names and macros and the
  cooking was left as an exercise for the reader.
*/

function money(n: unknown) {
  return Math.round(Number(n));
}

/** The stored ingredients blob, which is JSON and therefore worth distrusting. */
function readIngredients(json: unknown): string[] {
  if (Array.isArray(json)) {
    return json
      .map((row) => {
        if (typeof row === 'string') return row;
        if (row && typeof row === 'object') {
          const r = row as Record<string, unknown>;
          // Seeded rows are {item, amount} in either order of usefulness.
          const item = typeof r.item === 'string' ? r.item : typeof r.name === 'string' ? r.name : '';
          const amount =
            typeof r.amount === 'string'
              ? r.amount
              : typeof r.qty === 'string'
                ? r.qty
                : '';
          return [amount, item].filter(Boolean).join(' ').trim();
        }
        return '';
      })
      .filter(Boolean);
  }
  return [];
}

export default async function RecipePage({ params }: { params: { id: string } }) {
  /*
    The access check and the recipe at the same time. The check has to pass
    before anything renders — and it does, because nothing is returned until
    both settle — but the recipe lookup never needed to wait for it. It only
    needs the id in the URL.
  */
  const [, recipe] = await Promise.all([
    requireEntitledClient(),
    prisma.recipe.findUnique({ where: { id: params.id } }),
  ]);
  if (!recipe) notFound();

  const ingredients = readIngredients(recipe.ingredientsJson);
  // Stored as one block; each line is a step.
  const steps = (recipe.instructions ?? '')
    .split(/\r?\n+/)
    .map((l) => l.replace(/^\s*\d+[.)]\s*/, '').trim())
    .filter(Boolean);

  const totalTime = (recipe.prepTime ?? 0) + (recipe.cookTime ?? 0);

  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/nutrition"
        className="readout flex w-fit items-center gap-1.5 text-[11px] uppercase text-muted-foreground transition-colors hover:text-accent"
      >
        <ArrowLeft size={14} />
        Nutrition
      </Link>

      <header>
        <h1 className="display text-2xl">{recipe.title}</h1>
        <p className="readout mt-2 text-[11px] uppercase text-muted-foreground">
          {recipe.calories} cal · {money(recipe.protein)}p · {money(recipe.carbs)}c ·{' '}
          {money(recipe.fat)}f
          {recipe.servingSize ? ` · ${recipe.servingSize}` : ''}
        </p>
        {totalTime > 0 && (
          <p className="readout mt-1 flex items-center gap-1.5 text-[11px] uppercase text-muted-foreground">
            <Clock size={12} />
            {recipe.prepTime ? `${recipe.prepTime} min prep` : ''}
            {recipe.prepTime && recipe.cookTime ? ' · ' : ''}
            {recipe.cookTime ? `${recipe.cookTime} min cook` : ''}
          </p>
        )}
      </header>

      {ingredients.length > 0 && (
        <SystemWindow title="Ingredients" meta={`[${ingredients.length}]`}>
          <SystemWindowContent className="pt-4">
            <ul className="flex flex-col">
              {ingredients.map((line, i) => (
                <li
                  key={i}
                  className="flex gap-3 border-b border-border/40 py-2 text-sm last:border-b-0"
                >
                  <span className="readout w-6 shrink-0 text-[11px] text-muted-foreground">
                    {String(i + 1).padStart(2, '0')}
                  </span>
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          </SystemWindowContent>
        </SystemWindow>
      )}

      {steps.length > 0 && (
        <SystemWindow title="Method" plain>
          <SystemWindowContent className="flex flex-col gap-3 pt-4">
            {steps.map((step, i) => (
              <div key={i} className="flex gap-3">
                <span className="readout w-6 shrink-0 pt-0.5 text-[11px] text-accent">
                  {String(i + 1).padStart(2, '0')}
                </span>
                <p className="text-sm leading-relaxed">{step}</p>
              </div>
            ))}
          </SystemWindowContent>
        </SystemWindow>
      )}

      {ingredients.length === 0 && steps.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No method saved for this one yet. The macros above are what your plan counts.
        </p>
      )}
    </div>
  );
}
