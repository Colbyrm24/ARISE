import type { Metadata } from 'next';
import { LANDING } from '@/lib/landing-content';
import { normalizeSource } from '@/lib/application-fields';
import { ApplyForm } from '@/components/landing/apply-form';

/*
  The application. Public, like the page it's linked from, and just as free
  of the database: the form posts to /api/coaching/apply, which is the only
  thing that loads Prisma.
*/

export const metadata: Metadata = {
  title: `Apply · ${LANDING.coachName}`,
  description: LANDING.pageDescription,
  robots: { index: false },
};

export default function ApplyPage({ searchParams }: { searchParams?: { ref?: string } }) {
  return (
    <div className="landing-clean relative min-h-screen">
      <div aria-hidden className="viewport-frame" />
      <ApplyForm
        source={normalizeSource(searchParams?.ref)}
        instagramUrl={LANDING.instagramUrl}
        calendlyUrl={LANDING.calendlyUrl}
      />
    </div>
  );
}
