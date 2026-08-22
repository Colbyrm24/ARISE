import { requireCoach } from '@/lib/auth';
import { Sidebar } from '@/components/coach/sidebar';
import { CoachMobileNav } from '@/components/coach/mobile-nav';
import { countPendingMeals } from '@/lib/meal-review';

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  // Server-side check — a client account can never render this layout,
  // no matter what URL they type in.
  const coach = await requireCoach();

  // Read here rather than in the page so the badge is right on every screen,
  // not only the one it links to.
  const pendingMeals = await countPendingMeals(coach.id).catch(() => 0);

  return (
    <div className="min-h-screen">
      <Sidebar pendingMeals={pendingMeals} />
      {/* The console had no navigation at all below 768px — the sidebar is
          md-and-up and this header held only the wordmark. */}
      <div className="flex h-16 items-center justify-between border-b border-border px-5 md:hidden">
        <span className="text-lg font-semibold tracking-[0.2em]">ARISE</span>
        <CoachMobileNav pendingMeals={pendingMeals} />
      </div>
      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}
