import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { HabitCard } from '@/components/coach/habit-card';

/* Habits - the rows on their Today screen. Without one that screen is empty. */
export default async function Page({ params }: { params: { id: string } }) {
  // Confirms the client exists so a bad id 404s here rather than rendering
  // an empty card that looks like the feature is broken.
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    select: { userId: true },
  });

  if (!client) notFound();

  return <HabitCard clientId={client.userId} />;
}
