import Link from 'next/link';

/*
  The shell for /privacy and /terms.

  These two are the only pages in the app a stranger is meant to read
  end-to-end, signed out, possibly from a link in an app store listing or a
  Stripe checkout footer. So this layout does the opposite of the rest of
  ARISE: no system window, no lit frame, nothing moving. Just the wordmark,
  a measure set in globals.css at 64 characters, and generous leading.

  Deliberately outside both (auth) and (client). Middleware only guards
  /coach and the CLIENT_PREFIXES list, so these resolve for a signed-out
  visitor with no redirect — which is the whole point of having them.
*/
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background px-6 py-16">
      <div className="mx-auto w-full max-w-2xl">
        <Link
          href="/"
          className="display-wide text-2xl text-foreground transition-colors hover:text-accent"
        >
          ARISE
        </Link>

        <article className="legal mt-12">{children}</article>

        <footer className="mt-16 flex gap-6 border-t border-border pt-6">
          <Link
            href="/privacy"
            className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent"
          >
            Privacy
          </Link>
          <Link
            href="/terms"
            className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent"
          >
            Terms
          </Link>
          <a
            href="mailto:colbymullins24@gmail.com"
            className="readout text-[10px] uppercase text-muted-foreground transition-colors hover:text-accent"
          >
            Contact
          </a>
        </footer>
      </div>
    </div>
  );
}
