import { requireCoach } from '@/lib/auth';
import { Sidebar } from '@/components/coach/sidebar';
import { CoachMobileNav } from '@/components/coach/mobile-nav';
import { countPendingMeals } from '@/lib/meal-review';
import { countWaitingThreads } from '@/lib/waiting';
import type { BadgeCounts } from '@/components/coach/nav-items';

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  // Server-side check — a client account can never render this layout,
  // no matter what URL they type in.
  const coach = await requireCoach();

  // Read here rather than in the pages so the badges are right on every
  // screen, not only the ones they link to. Each falls back to zero on its
  // own — a badge query failing must not take the console down with it.
  const [pendingMeals, waitingThreads] = await Promise.all([
    countPendingMeals(coach.id).catch(() => 0),
    countWaitingThreads(coach.id).catch(() => 0),
  ]);
  const counts: BadgeCounts = { pendingMeals, waitingThreads };

  return (
    <div className="min-h-screen">
      <div aria-hidden className="viewport-frame" />
      <Sidebar counts={counts} />
      {/* The console had no navigation at all below 768px — the sidebar is
          md-and-up and this header held only the wordmark. */}
      <div className="relative flex h-16 items-center justify-between border-b border-accent/25 px-5 shadow-[0_1px_0_hsl(var(--accent)/0.3),0_14px_44px_-14px_hsl(var(--system)/0.8)] md:hidden">
        <span className="glow-mark text-lg font-semibold tracking-[0.2em]">ARISE</span>
        <CoachMobileNav counts={counts} />
      </div>
      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}
