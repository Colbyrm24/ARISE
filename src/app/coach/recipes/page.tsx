import { UtensilsCrossed, Trash2 } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { createRecipe, deleteRecipe } from './actions';

export default async function CoachRecipesPage() {
  const recipes = await prisma.recipe.findMany({ orderBy: { title: 'asc' } });

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Recipes</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Build out your meal library — clients subscribe to these from their Nutrition tab and it
          auto-calculates against their calorie and macro targets.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle>Add Recipe</CardTitle>
        </CardHeader>
        <CardContent>
          <form action={createRecipe} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Input name="title" placeholder="Recipe name" required className="sm:col-span-2" />
            <Input name="calories" type="number" min="0" placeholder="Calories" required />
            <Input name="servingSize" placeholder="Serving size (e.g. 1 bowl)" />
            <Input name="protein" type="number" step="0.1" min="0" placeholder="Protein (g)" required />
            <Input name="carbs" type="number" step="0.1" min="0" placeholder="Carbs (g)" required />
            <Input name="fat" type="number" step="0.1" min="0" placeholder="Fat (g)" required className="sm:col-span-2" />
            <Input name="prepTime" type="number" min="0" placeholder="Prep time (min)" />
            <Input name="cookTime" type="number" min="0" placeholder="Cook time (min)" />
            <Input name="ingredients" placeholder="Ingredients, comma separated" className="sm:col-span-2" />
            <textarea
              name="instructions"
              rows={3}
              placeholder="Instructions"
              className="sm:col-span-2 w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <Input name="tags" placeholder="Tags, comma separated (e.g. high-protein, quick)" className="sm:col-span-2" />
            <Button type="submit" size="sm" className="w-fit sm:col-span-2">
              Add Recipe
            </Button>
          </form>
        </CardContent>
      </Card>

      {recipes.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-10 text-center">
            <UtensilsCrossed size={22} className="text-muted-foreground" />
            <p className="text-sm text-muted-foreground">No recipes yet — add your first one above.</p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {recipes.map((recipe) => (
            <li key={recipe.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 pt-6">
                  <div>
                    <p className="text-sm font-medium">{recipe.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {recipe.calories} cal · {Number(recipe.protein)}g protein · {Number(recipe.carbs)}g carbs ·{' '}
                      {Number(recipe.fat)}g fat
                      {recipe.servingSize ? ` · ${recipe.servingSize}` : ''}
                    </p>
                    {recipe.tags.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {recipe.tags.map((tag) => (
                          <Badge key={tag} variant="outline">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <form action={deleteRecipe}>
                    <input type="hidden" name="recipeId" value={recipe.id} />
                    <button
                      type="submit"
                      title="Delete recipe"
                      className="shrink-0 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <Trash2 size={15} />
                    </button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
