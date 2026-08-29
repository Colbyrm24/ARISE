/*
  The console's equivalent of the client shell's loading state.

  Same reasoning as (client)/loading.tsx: without it the browser holds the
  previous screen until the last query returns, which is exactly the pause
  that reads as slowness. The sidebar and header live in the layout and are
  already on screen by the time this renders — only the panel is waiting.
*/
function Bar({ className = '' }: { className?: string }) {
  return <div className={`animate-pulse rounded-sm bg-muted-foreground/15 ${className}`} />;
}

export default function CoachLoading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>

      <Bar className="h-7 w-52" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex flex-col gap-2 border border-border/60 p-4">
            <Bar className="h-2.5 w-16" />
            <Bar className="h-6 w-10" />
          </div>
        ))}
      </div>

      <div className="flex flex-col border border-border/60">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 border-b border-border/40 p-4 last:border-b-0">
            <Bar className="h-8 w-8 rounded-full" />
            <Bar className="h-3 w-40" />
            <Bar className="ml-auto h-3 w-16" />
          </div>
        ))}
      </div>
    </div>
  );
}
