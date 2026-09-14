'use client';

import { useEffect } from 'react';
import { ErrorPanel } from '@/components/error-panel';

/*
  The console's boundary.

  The billing card is the reason this exists: eight uncaught Prisma queries in
  one Promise.all on the client detail page, two of them reading columns added
  by hand-applied migrations. Any one of them failing took the whole page down
  — including the parts that were fine — on the screen the coach uses to run
  his business.
*/
export default function CoachError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Coach console error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <ErrorPanel
      title="This screen did not load"
      body="A query failed on our end. Nothing has been changed or lost — try again, and if it keeps failing the details are in the Vercel logs."
      reset={reset}
    />
  );
}
