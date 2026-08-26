import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { CoachMealPlanCard } from '@/components/coach/meal-plan-card';

/* Meals - the plan they open the app to, and the meals waiting on your review. */
export default async function Page({ params }: { params: { id: string } }) {
  // Confirms the client exists so a bad id 404s here rather than rendering
  // an empty card that looks like the feature is broken.
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    select: { userId: true },
  });

  if (!client) notFound();

  return <CoachMealPlanCard clientId={client.userId} />;
}
