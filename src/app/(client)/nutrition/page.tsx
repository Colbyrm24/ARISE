import { Trash2 } from 'lucide-react';
import { requireClient } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { logMeal, removeMealLog } from './actions';

function todayDateOnly() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

const MEAL_OPTIONS = ['breakfast', 'lunch', 'dinner', 'snack'];

export default async function NutritionPage() {
  const user = await requireClient();
  const today = todayDateOnly();

  const [target, todayLogs, recipes] = await Promise.all([
    prisma.nutritionTarget.findFirst({
      where: { clientId: user.id, effectiveDate: { lte: today } },
      orderBy: { effectiveDate: 'desc' },
    }),
    prisma.nutritionLog.findMany({
      where: { clientId: user.id, date: today },
      include: { recipe: true, food: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.recipe.findMany({ orderBy: { title: 'asc' } }),
  ]);

  const caloriesEaten = todayLogs.reduce((sum, l) => sum + l.calories, 0);
  const proteinEaten = todayLogs.reduce((sum, l) => sum + Number(l.protein), 0);
  const carbsEaten = todayLogs.reduce((sum, l) => sum + Number(l.carbs), 0);
  const fatEaten = todayLogs.reduce((sum, l) => sum + Number(l.fat), 0);

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-2xl font-semibold">Nutrition</h1>
      </header>

      {/* Today's progress */}
      <Card>
        <CardHeader>
          <CardTitle>Today</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {target ? (
            <>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Calories</span>
                  <span className="text-muted-foreground">
                    {caloriesEaten} / {target.calories}
                  </span>
                </div>
                <Progress value={Math.min((caloriesEaten / target.calories) * 100, 100)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Protein</span>
                  <span className="text-muted-foreground">
                    {Math.round(proteinEaten)}g / {Number(target.protein)}g
                  </span>
                </div>
                <Progress value={Math.min((proteinEaten / Number(target.protein)) * 100, 100)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Carbs</span>
                  <span className="text-muted-foreground">
                    {Math.round(carbsEaten)}g / {Number(target.carbs)}g
                  </span>
                </div>
                <Progress value={Math.min((carbsEaten / Number(target.carbs)) * 100, 100)} />
              </div>
              <div>
                <div className="mb-1.5 flex items-baseline justify-between text-sm">
                  <span>Fat</span>
                  <span className="text-muted-foreground">
                    {Math.round(fatEaten)}g / {Number(target.fat)}g
                  </span>
                </div>
                <Progress value={Math.min((fatEaten / Number(target.fat)) * 100, 100)} />
              </div>
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Your coach hasn&apos;t set your targets yet.</p>
          )}
        </CardContent>
      </Card>

      {/* Today's meals */}
      {todayLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Today&apos;s Meals</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {todayLogs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between rounded-xl border border-border bg-secondary/20 px-4 py-3"
              >
                <div>
                  <p className="text-sm font-medium">{log.recipe?.title ?? log.food?.name ?? 'Meal'}</p>
                  <p className="text-xs text-muted-foreground">
                    {log.meal ? `${log.meal} · ` : ''}
                    {log.calories} cal · {Number(log.protein)}g protein
                  </p>
                </div>
                <form action={removeMealLog}>
                  <input type="hidden" name="logId" value={log.id} />
                  <button type="submit" className="text-muted-foreground transition-colors hover:text-destructive">
                    <Trash2 size={16} />
                  </button>
                </form>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Meal library */}
      <Card>
        <CardHeader>
          <CardTitle>Meal Library</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {recipes.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your coach hasn&apos;t added any recipes yet.</p>
          ) : (
            recipes.map((recipe) => (
              <div
                key={recipe.id}
                className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="text-sm font-medium">{recipe.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {recipe.calories} cal · {Number(recipe.protein)}g protein · {Number(recipe.carbs)}g carbs ·{' '}
                    {Number(recipe.fat)}g fat
                  </p>
                </div>
                <form action={logMeal} className="flex items-center gap-2">
                  <input type="hidden" name="recipeId" value={recipe.id} />
                  <input type="hidden" name="quantity" value="1" />
                  <select
                    name="meal"
                    defaultValue="snack"
                    className="h-9 rounded-lg border border-input bg-secondary/40 px-2 text-xs text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {MEAL_OPTIONS.map((m) => (
                      <option key={m} value={m}>
                        {m.charAt(0).toUpperCase() + m.slice(1)}
                      </option>
                    ))}
                  </select>
                  <Button type="submit" variant="outline" size="sm">
                    Log
                  </Button>
                </form>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </div>
  );
}
