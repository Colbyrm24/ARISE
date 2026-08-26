import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { ClientProgressCard } from '@/components/progress/client-progress-card';

/* Progress - weight, steps and everything they have logged over time. */
export default async function Page({ params }: { params: { id: string } }) {
  // Confirms the client exists so a bad id 404s here rather than rendering
  // an empty card that looks like the feature is broken.
  const client = await prisma.client.findUnique({
    where: { userId: params.id },
    select: { userId: true },
  });

  if (!client) notFound();

  return <ClientProgressCard clientId={client.userId} />;
}
