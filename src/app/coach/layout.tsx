import { requireCoach } from '@/lib/auth';
import { Sidebar } from '@/components/coach/sidebar';

export default async function CoachLayout({ children }: { children: React.ReactNode }) {
  // Server-side check — a client account can never render this layout,
  // no matter what URL they type in.
  await requireCoach();

  return (
    <div className="min-h-screen">
      <Sidebar />
      <div className="flex h-16 items-center border-b border-border px-6 md:hidden">
        <span className="text-lg font-semibold tracking-[0.2em]">ARISE</span>
      </div>
      <main className="md:pl-60">
        <div className="mx-auto max-w-6xl px-6 py-8 md:px-10 md:py-10">{children}</div>
      </main>
    </div>
  );
}
