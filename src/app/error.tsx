'use client';

import { useEffect } from 'react';
import { ErrorPanel } from '@/components/error-panel';

/*
  The catch-all for everything outside the two app shells: the agreement a
  client signs, the join funnel, onboarding, /welcome. These are the screens a
  person meets before they are a client, and the two that money passes
  through, so a generic Next error page here is the worst possible place for
  one.
*/
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled app error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col justify-center p-6">
      <ErrorPanel reset={reset} />
    </main>
  );
}
