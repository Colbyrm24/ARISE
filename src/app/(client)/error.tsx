'use client';

import { useEffect } from 'react';
import { ErrorPanel } from '@/components/error-panel';

/*
  The client app's boundary. Covers Today, Workouts, Nutrition, Messages and
  Progress — every screen a client touches, including the workout logger,
  which until now lost its whole self to a generic error page if a single
  number was out of range.

  The layout stays: bottom nav is above this in the tree, so a client who hits
  this can still walk to another screen rather than being stranded.
*/
export default function ClientError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // The only record there is. There is no error reporter wired up yet, so
    // this is the difference between a failure that can be found in the
    // Vercel logs and one that leaves no trace at all.
    console.error('Client app error', { message: error.message, digest: error.digest });
  }, [error]);

  return <ErrorPanel reset={reset} />;
}
