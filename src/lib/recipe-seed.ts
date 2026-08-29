import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';

/*
  The meal library.

  Twenty-one meals — seven days of breakfast, lunch and dinner — built to the
  shape Colby's plans actually run: familiar food people already know how to
  cook, protein carried by every single meal, and a day that lands near 2,600
  calories and 190g of protein without anyone having to think about it.

  Written from scratch. The plans he showed me live in another platform and
  their recipe text and photography are not ours to move, so these are our own
  ingredients, our own method and our own numbers. The dishes are the same kind
  of thing — a steak wrap is a steak wrap — but nothing here is lifted.

  Macros are per serving and were built from the ingredient list rather than
  estimated after the fact, so a client swapping one meal for another is
  swapping something real.
*/

export type SeedRecipe = {
  title: string;
  meal: 'breakfast' | 'lunch' | 'dinner';
  day: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  servingSize: string;
  prepTime: number;
  cookTime: number;
  ingredients: string[];
  instructions: string;
  tags: string[];
};

export const RECIPES: SeedRecipe[] = [
  // --- breakfasts ---------------------------------------------------------
  {
    title: 'Turkey Bacon, Eggs and Toast',
    meal: 'breakfast', day: 1,
    calories: 940, protein: 58, carbs: 72, fat: 44,
    servingSize: '1 plate', prepTime: 5, cookTime: 12,
    ingredients: ['3 whole eggs', '3 egg whites', '4 slices turkey bacon', '2 slices sourdough', '1 tbsp butter', 'Salt and pepper'],
    instructions:
      'Crisp the turkey bacon in a dry pan over medium heat, about 4 minutes a side, and set aside. Wipe the pan, drop the heat to low and scramble the eggs and whites slowly — low and slow is the whole difference between soft eggs and rubber. Toast the sourdough and butter it while they finish.',
    tags: ['high-protein', 'quick', 'breakfast'],
  },
  {
    title: 'Cinnamon Protein Pancakes',
    meal: 'breakfast', day: 2,
    calories: 935, protein: 62, carbs: 118, fat: 22,
    servingSize: '4 pancakes', prepTime: 5, cookTime: 10,
    ingredients: ['1 cup oats blended to flour', '2 scoops vanilla protein', '1 whole egg', '3/4 cup egg whites', '1 tsp cinnamon', '1 tsp baking powder', '1/2 cup almond milk', '2 tbsp maple syrup'],
    instructions:
      'Blend everything except the syrup until smooth and let the batter sit 5 minutes so the oats drink it in — skip that and they cook gummy. Ladle onto a non-stick pan over medium-low and flip once the edges set. Syrup at the table.',
    tags: ['high-protein', 'breakfast', 'meal-prep'],
  },
  {
    title: 'Steak and Egg Breakfast Burrito',
    meal: 'breakfast', day: 3,
    calories: 950, protein: 65, carbs: 78, fat: 40,
    servingSize: '1 burrito', prepTime: 8, cookTime: 10,
    ingredients: ['5 oz sirloin, sliced thin', '2 whole eggs', '1/2 cup egg whites', '1 large flour tortilla', '1/3 cup shredded cheddar', '1/4 cup salsa', 'Hot sauce'],
    instructions:
      'Sear the sirloin hard in a screaming pan for 2 minutes a side and rest it while you scramble the eggs. Warm the tortilla directly over the burner for a few seconds a side so it folds without cracking. Layer steak, eggs, cheese and salsa, then roll it tight.',
    tags: ['high-protein', 'breakfast'],
  },
  {
    title: 'Greek Yogurt Bowl with Granola and Berries',
    meal: 'breakfast', day: 4,
    calories: 900, protein: 65, carbs: 105, fat: 20,
    servingSize: '1 bowl', prepTime: 5, cookTime: 0,
    ingredients: ['2 cups non-fat Greek yogurt', '1 scoop vanilla protein', '2/3 cup granola', '1 cup mixed berries', '1 tbsp honey', '1 tbsp chia seeds'],
    instructions:
      'Stir the protein into the yogurt first with a splash of water so it goes smooth instead of chalky. Top with granola, berries, chia and honey. No cooking, which is the point — this is the one for mornings you are already late.',
    tags: ['high-protein', 'no-cook', 'breakfast'],
  },
  {
    title: 'Egg White and Sausage Breakfast Sandwich',
    meal: 'breakfast', day: 5,
    calories: 920, protein: 60, carbs: 84, fat: 34,
    servingSize: '1 sandwich', prepTime: 5, cookTime: 10,
    ingredients: ['1 cup egg whites', '1 whole egg', '2 chicken sausage patties', '1 english muffin', '1 slice cheddar', '1/2 avocado'],
    instructions:
      'Brown the sausage patties through, about 4 minutes a side. Pour the whites and egg into a small ring or a pan lid so they set into a round instead of spreading. Stack on the toasted muffin with the cheese while everything is still hot enough to melt it, avocado last.',
    tags: ['high-protein', 'breakfast'],
  },
  {
    title: 'Ham, Egg and Cheese Wrap',
    meal: 'breakfast', day: 6,
    calories: 930, protein: 58, carbs: 80, fat: 38,
    servingSize: '1 wrap', prepTime: 5, cookTime: 8,
    ingredients: ['4 oz deli ham', '3 whole eggs', '1/2 cup egg whites', '1 large tortilla', '1/3 cup shredded cheese', '1 cup spinach', 'Black pepper'],
    instructions:
      'Wilt the spinach in the pan first and push it to one side. Scramble the eggs beside it, lay the ham over the top for the last minute so it warms without drying out. Fold it all into a warmed tortilla with the cheese.',
    tags: ['high-protein', 'quick', 'breakfast'],
  },
  {
    title: 'Blueberry Protein Oats with Eggs',
    meal: 'breakfast', day: 7,
    calories: 910, protein: 57, carbs: 112, fat: 25,
    servingSize: '1 bowl + 3 eggs', prepTime: 3, cookTime: 8,
    ingredients: ['1 cup rolled oats', '1 scoop vanilla protein', '1 cup blueberries', '1 tbsp peanut butter', '1 cup milk', '3 whole eggs'],
    instructions:
      'Cook the oats in the milk, then take them off the heat before stirring the protein through — stir it in over heat and it seizes into lumps every time. Blueberries and peanut butter on top. Eggs scrambled on the side to carry the protein.',
    tags: ['high-protein', 'breakfast'],
  },

  // --- lunches ------------------------------------------------------------
  {
    title: 'Mexican Chicken Bowl',
    meal: 'lunch', day: 1,
    calories: 960, protein: 72, carbs: 96, fat: 26,
    servingSize: '1 bowl', prepTime: 10, cookTime: 15,
    ingredients: ['8 oz chicken breast', '1.5 cups cooked white rice', '1/2 cup black beans', '1/2 cup corn', '1/3 cup pico de gallo', '1/4 avocado', 'Juice of 1 lime', 'Cumin, chili powder, garlic powder'],
    instructions:
      'Season the chicken heavily with the cumin, chili and garlic and grill or pan-sear 6 minutes a side. Rest it 5 minutes before slicing or the juice ends up on the board instead of in the bowl. Build over the rice and finish with lime.',
    tags: ['high-protein', 'meal-prep', 'lunch'],
  },
  {
    title: 'Southwest Steak Wrap',
    meal: 'lunch', day: 2,
    calories: 940, protein: 68, carbs: 88, fat: 30,
    servingSize: '1 wrap', prepTime: 10, cookTime: 10,
    ingredients: ['7 oz flank steak', '1 large tortilla', '3/4 cup cooked rice', '1/4 cup black beans', '1/4 cup corn salsa', '2 tbsp chipotle greek yogurt sauce', 'Romaine'],
    instructions:
      'Sear the flank 3 minutes a side for medium and rest it, then slice against the grain — with the grain and it chews like rope no matter how well you cooked it. Warm the tortilla, layer rice, beans, steak, salsa and the chipotle yogurt, roll tight and cut on the diagonal.',
    tags: ['high-protein', 'lunch'],
  },
  {
    title: 'Turkey Burger with Oven Fries',
    meal: 'lunch', day: 3,
    calories: 930, protein: 65, carbs: 92, fat: 28,
    servingSize: '1 burger + fries', prepTime: 10, cookTime: 25,
    ingredients: ['8 oz 93/7 ground turkey', '1 brioche bun', '1 slice cheddar', '1 large russet potato', '1 tsp olive oil', 'Lettuce, tomato, red onion', 'Mustard and light mayo'],
    instructions:
      'Cut the potato into batons, toss with the oil and salt and roast at 425F for 25 minutes, flipping once. Form the turkey into one thick patty, thumbprint the centre so it does not dome, and cook 5 minutes a side. Cheese on for the last minute under a lid.',
    tags: ['high-protein', 'lunch'],
  },
  {
    title: 'Chicken Caesar Wrap',
    meal: 'lunch', day: 4,
    calories: 910, protein: 70, carbs: 76, fat: 32,
    servingSize: '1 wrap', prepTime: 8, cookTime: 12,
    ingredients: ['8 oz chicken breast', '1 large tortilla', '2 cups chopped romaine', '3 tbsp light caesar dressing', '2 tbsp parmesan', 'Cracked pepper'],
    instructions:
      'Grill the chicken and slice it while still warm. Toss the romaine with the dressing and parmesan right before you build it — dressed early and the whole thing goes limp by lunch. Roll tight and wrap in foil if it is travelling.',
    tags: ['high-protein', 'quick', 'lunch'],
  },
  {
    title: 'Shrimp Fried Rice',
    meal: 'lunch', day: 5,
    calories: 950, protein: 62, carbs: 118, fat: 22,
    servingSize: '1 large bowl', prepTime: 10, cookTime: 12,
    ingredients: ['8 oz shrimp, peeled', '2 cups day-old cooked rice', '2 whole eggs', '1 cup frozen peas and carrots', '2 tbsp low sodium soy sauce', '1 tsp sesame oil', '2 cloves garlic', 'Scallions'],
    instructions:
      'Day-old rice matters here — fresh rice steams instead of frying and you end up with a wet clump. Scramble the eggs and set aside, sear the shrimp 90 seconds a side, then hit the pan with garlic, rice and veg on high. Everything back in, soy and sesame last.',
    tags: ['high-protein', 'lunch'],
  },
  {
    title: 'Buffalo Chicken Rice Bowl',
    meal: 'lunch', day: 6,
    calories: 940, protein: 74, carbs: 94, fat: 24,
    servingSize: '1 bowl', prepTime: 8, cookTime: 15,
    ingredients: ['9 oz chicken breast', '1.5 cups cooked jasmine rice', '3 tbsp buffalo sauce', '2 tbsp non-fat greek yogurt', 'Celery, diced', '1 tbsp blue cheese crumbles'],
    instructions:
      'Cook and dice the chicken, then toss it in the buffalo sauce off the heat so the sauce coats rather than burns. Thin the yogurt with a splash of water to make a drizzle. Over rice with the celery for crunch and the blue cheese scattered on top.',
    tags: ['high-protein', 'meal-prep', 'lunch'],
  },
  {
    title: 'Ground Beef Taco Bowl',
    meal: 'lunch', day: 7,
    calories: 970, protein: 68, carbs: 90, fat: 34,
    servingSize: '1 bowl', prepTime: 8, cookTime: 15,
    ingredients: ['8 oz 93/7 ground beef', '1.5 cups cooked rice', '1/2 cup black beans', '1/3 cup salsa', '1/4 cup shredded cheese', 'Shredded lettuce', 'Taco seasoning'],
    instructions:
      'Brown the beef and drain it properly before the seasoning goes in — seasoning into the fat and it all pours down the sink with it. Add the seasoning with a splash of water and simmer 2 minutes. Build over rice.',
    tags: ['high-protein', 'meal-prep', 'lunch'],
  },

  // --- dinners ------------------------------------------------------------
  {
    title: 'Roasted Chicken Quesadilla',
    meal: 'dinner', day: 1,
    calories: 770, protein: 62, carbs: 62, fat: 30,
    servingSize: '1 quesadilla', prepTime: 8, cookTime: 10,
    ingredients: ['7 oz cooked chicken breast, shredded', '2 medium tortillas', '2/3 cup shredded cheese', '1/4 cup diced red pepper', '1/4 cup diced onion', 'Salsa and greek yogurt to serve'],
    instructions:
      'Soften the pepper and onion in a dry pan first so they do not steam the tortilla from the inside. Cheese, chicken, veg, cheese again — cheese on both faces is what actually glues it shut. Dry pan, medium, 3 minutes a side under a little pressure.',
    tags: ['high-protein', 'dinner'],
  },
  {
    title: 'Garlic Butter Steak and Potatoes',
    meal: 'dinner', day: 2,
    calories: 780, protein: 60, carbs: 52, fat: 34,
    servingSize: '1 plate', prepTime: 10, cookTime: 20,
    ingredients: ['8 oz sirloin', '10 oz baby potatoes', '1 tbsp butter', '3 cloves garlic', 'Fresh thyme', 'Salt and cracked pepper'],
    instructions:
      'Boil the potatoes until a knife slides in, then smash and crisp them in the pan. Get the steak pan properly hot before the meat touches it, 4 minutes a side for medium, then butter garlic and thyme in for the last minute and spoon it over. Rest 5 minutes before cutting.',
    tags: ['high-protein', 'dinner'],
  },
  {
    title: 'Baked Salmon with Rice and Asparagus',
    meal: 'dinner', day: 3,
    calories: 770, protein: 55, carbs: 62, fat: 30,
    servingSize: '1 plate', prepTime: 5, cookTime: 18,
    ingredients: ['7 oz salmon fillet', '1 cup cooked rice', '1 bunch asparagus', '1 tsp olive oil', '1/2 lemon', 'Garlic powder, salt, pepper'],
    instructions:
      'Salmon skin-side down on a lined tray at 400F for 12 to 14 minutes — pull it when the centre still looks slightly underdone, it carries on cooking on the plate. Asparagus on the same tray for the last 8. Lemon over everything at the end.',
    tags: ['high-protein', 'dinner'],
  },
  {
    title: 'Chicken Fajita Skillet',
    meal: 'dinner', day: 4,
    calories: 760, protein: 65, carbs: 58, fat: 26,
    servingSize: '1 skillet', prepTime: 10, cookTime: 15,
    ingredients: ['8 oz chicken breast, sliced', '1 bell pepper', '1/2 onion', '1 cup cooked rice', '1 tbsp olive oil', 'Fajita seasoning', 'Lime and cilantro'],
    instructions:
      'Cook the chicken first and pull it out, then the peppers and onion in the same pan so they pick up the fond. Everything back in with the seasoning for the last 2 minutes. Over rice with lime and cilantro.',
    tags: ['high-protein', 'quick', 'dinner'],
  },
  {
    title: 'Turkey Meatballs with Marinara and Pasta',
    meal: 'dinner', day: 5,
    calories: 780, protein: 62, carbs: 82, fat: 20,
    servingSize: '1 plate', prepTime: 12, cookTime: 20,
    ingredients: ['8 oz 93/7 ground turkey', '1/4 cup breadcrumbs', '1 egg', '3 oz dry pasta', '3/4 cup marinara', '2 tbsp parmesan', 'Italian seasoning, garlic'],
    instructions:
      'Mix the turkey with the breadcrumbs, egg and seasoning gently and stop as soon as it comes together — worked too hard and the meatballs go dense. Roll and bake at 400F for 18 minutes, then finish them in the marinara while the pasta cooks.',
    tags: ['high-protein', 'meal-prep', 'dinner'],
  },
  {
    title: 'Honey Garlic Chicken with Jasmine Rice',
    meal: 'dinner', day: 6,
    calories: 775, protein: 64, carbs: 78, fat: 20,
    servingSize: '1 plate', prepTime: 8, cookTime: 15,
    ingredients: ['8 oz chicken thigh, trimmed', '1 cup cooked jasmine rice', '2 tbsp honey', '2 tbsp low sodium soy sauce', '3 cloves garlic', '1 tsp rice vinegar', 'Broccoli'],
    instructions:
      'Sear the chicken until it has real colour on both sides. Add the honey, soy, garlic and vinegar and let it reduce until it coats the back of a spoon, about 3 minutes — any longer and the honey turns bitter. Steamed broccoli and rice underneath.',
    tags: ['high-protein', 'dinner'],
  },
  {
    title: 'Blackened Tilapia with Sweet Potato',
    meal: 'dinner', day: 7,
    calories: 765, protein: 58, carbs: 66, fat: 24,
    servingSize: '1 plate', prepTime: 8, cookTime: 20,
    ingredients: ['9 oz tilapia', '1 large sweet potato', '1 tbsp olive oil', 'Blackening seasoning', 'Green beans', '1/2 lemon'],
    instructions:
      'Cube and roast the sweet potato at 425F for 20 minutes. Coat the tilapia heavily in the blackening seasoning and cook 3 minutes a side in a hot pan — it should smoke a little, that is the point. Green beans blanched, lemon over the fish.',
    tags: ['high-protein', 'dinner'],
  },
];

export const PLAN_NAME = 'Your Meals';

/** Totals per day, so the plan screen can say what it adds up to. */
export function dayTotals(day: number) {
  const meals = RECIPES.filter((r) => r.day === day);
  return meals.reduce(
    (t, m) => ({
      calories: t.calories + m.calories,
      protein: t.protein + m.protein,
      carbs: t.carbs + m.carbs,
      fat: t.fat + m.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
}

/**
 * Puts the library in the database for one coach.
 *
 * Matched on title so a re-run repairs rather than duplicates, and so a recipe
 * the coach has since edited is left exactly as they left it.
 */
export async function seedRecipeLibrary(coachId: string) {
  const existing = await prisma.recipe.findMany({
    where: { title: { in: RECIPES.map((r) => r.title) } },
    select: { id: true, title: true },
  });
  const byTitle = new Map(existing.map((r) => [r.title, r.id]));

  const missing = RECIPES.filter((r) => !byTitle.has(r.title)).map((r) => ({
    id: randomUUID(),
    coachId,
    title: r.title,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    servingSize: r.servingSize,
    ingredientsJson: r.ingredients,
    instructions: r.instructions,
    prepTime: r.prepTime,
    cookTime: r.cookTime,
    tags: r.tags,
  }));

  if (missing.length > 0) {
    await prisma.recipe.createMany({ data: missing, skipDuplicates: true });
    for (const m of missing) byTitle.set(m.title, m.id);
  }

  return { created: missing.length, byTitle };
}

/**
 * Puts a client on the standard plan and makes it their active one.
 *
 * Twenty-one lines, but not twenty-one meals: three meals with seven options
 * under each, and the client picks one of every meal. That distinction was
 * only ever implied by this function's old name, and both screens that read
 * the result added the twenty-one lines together — which is how a normal plan
 * came to announce 18,485 calories.
 *
 * Every line carries its own macros rather than pointing at the recipe for
 * them, so editing a recipe in November cannot rewrite what someone was told
 * to eat in September. recipeId still rides along so the client can open the
 * full method from the plan.
 */
export async function assignOptionPlan(coachId: string, clientId: string) {
  const { byTitle } = await seedRecipeLibrary(coachId);

  // One active plan at a time, or the client's screen has to guess.
  await prisma.mealPlan.updateMany({ where: { clientId, active: true }, data: { active: false } });

  const plan = await prisma.mealPlan.create({
    data: {
      clientId,
      coachId,
      name: PLAN_NAME,
      note: 'Seven ways to do each meal. Pick one from every meal and the day lands around 2,600 calories and 190g of protein.',
      active: true,
    },
  });

  await prisma.mealPlanItem.createMany({
    data: RECIPES.map((r, i) => ({
      planId: plan.id,
      meal: r.meal,
      // Grouped by meal, so the options under Breakfast read in a stable
      // order. `day` survives only as that ordering — it is not a day any
      // more, and nothing downstream should treat it as one.
      position: { breakfast: 0, lunch: 1, dinner: 2 }[r.meal] * 100 + r.day,
      recipeId: byTitle.get(r.title) ?? null,
      name: r.title,
      quantity: 1,
      calories: r.calories,
      protein: r.protein,
      carbs: r.carbs,
      fat: r.fat,
      // No "Day 3" note. It printed under the line on the client's screen as
      // if it meant something, and under an options plan it means nothing.
      note: null,
    })),
  });

  return { planId: plan.id, items: RECIPES.length };
}
