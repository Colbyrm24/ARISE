/*
  What a client sees while their day is being fetched.

  Without this file nothing at all is sent until every query on the page has
  come back — the browser sits on a white screen holding the previous page,
  and on a phone on cellular that reads as "the app is slow" even when the
  server was quick. With it, the shell and the navigation arrive immediately
  and the content fills in underneath.

  Deliberately plain shapes rather than a spinner. A spinner says "wait"; a
  layout that already looks like the screen you asked for says "it's coming",
  and it doesn't move the page around when the real content lands.
*/
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted-foreground/15 ${className}`} />;
}

export default function ClientLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <header className="flex flex-col gap-2">
        <Bar className="h-7 w-40" />
        <Bar className="h-3.5 w-56" />
      </header>

      {[0, 1, 2].map((i) => (
        <div key={i} className="flex flex-col gap-3 border border-border/60 p-4">
          <Bar className="h-3 w-24" />
          <Bar className="h-2.5 w-full" />
          <Bar className="h-2.5 w-4/5" />
        </div>
      ))}
    </div>
  );
}
