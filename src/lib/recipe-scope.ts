import { coachIdForClient } from '@/lib/notifications';

/*
  Whose recipes somebody can see.

  `Recipe.coachId` is nullable and `Food.ownerId` is nullable, and the two
  columns mean the same thing: null is the shared library, a value is one
  person's own. Food was scoped to `OR: [{ ownerId: null }, { ownerId: user.id }]`
  after somebody's "Mom's lasagna" turned up in everybody's search results.
  Recipe was never given the same treatment, so every read of it was a read of
  every recipe in the database:

    - the client's Nutrition tab listed every coach's library
    - /recipes/[id] rendered any recipe by id, ingredients and method included
    - the coach's own Recipes screen listed other coaches' recipes with a
      delete button beside each
    - logging a recipe, and attaching one to a meal plan, both accepted any id

  deleteRecipe already scopes itself and says why in a comment that ends "any
  coach account could delete another coach's recipes using an id a client
  handed them". The id was handed out because of the reads above. This is the
  other half of that fix.

  Written as a function returning a fresh object rather than a shared const:
  a `where` fragment hoisted into a module-level constant loses Prisma's
  contextual typing, and that is exactly how a `string[]` where a
  `ClientStatus[]` was wanted reached a build and stalled production for half
  an hour. A function called at the query site keeps the literal inline.
*/

/** The shared library plus this coach's own. */
export function recipesVisibleToCoach(coachId: string, isAdmin = false) {
  // An admin exists to clean up after coaches, so they see everything —
  // matching coachOwnsTemplate and coachOwnsClient.
  if (isAdmin) return {};
  return { OR: [{ coachId: null }, { coachId }] };
}

/**
 * The shared library plus the library of the coach this client actually has.
 *
 * `coachIdForClient` falls back to the primary coach for an account that
 * predates assignment, so a client is never left with an empty recipe tab —
 * which is the failure that matters more here than the leak, because a
 * nutrition screen with no food in it reads as a broken app.
 */
export async function recipesVisibleToClient(clientId: string) {
  const coachId = await coachIdForClient(clientId);
  return coachId ? { OR: [{ coachId: null }, { coachId }] } : { coachId: null };
}
