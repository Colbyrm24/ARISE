'use client';

import { useEffect } from 'react';

/*
  The last resort: a throw in the root layout itself, which is above every
  other boundary in the tree. Next replaces the entire document when this
  renders, so it has to supply its own <html> and <body> — and it cannot use
  anything from the layout that just failed, which is why the styling here is
  inline rather than Tailwind classes that may never have been loaded.

  Dark by default because the app is, and because a white flash at the moment
  everything has gone wrong is its own small insult.
*/
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Root layout error', { message: error.message, digest: error.digest });
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#0a0a0a',
          color: '#fafafa',
          fontFamily: 'system-ui, -apple-system, sans-serif',
          padding: '24px',
        }}
      >
        <div style={{ maxWidth: '32rem' }} role="alert">
          <h1 style={{ fontSize: '1.25rem', margin: '0 0 12px' }}>ARISE could not start</h1>
          <p style={{ lineHeight: 1.6, color: '#a1a1aa', margin: '0 0 20px' }}>
            Something failed before the app could load. Nothing you have logged is lost.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              height: '44px',
              padding: '0 20px',
              background: 'transparent',
              color: '#fafafa',
              border: '1px solid #3f3f46',
              fontSize: '0.75rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
