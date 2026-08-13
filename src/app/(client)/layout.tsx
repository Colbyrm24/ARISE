import { requireClient } from '@/lib/auth';
import { BottomNav } from '@/components/client/bottom-nav';
import { AiFab } from '@/components/client/ai-fab';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  // Server-side check — a coach account can never render this layout,
  // no matter what URL they type in.
  await requireClient();

  return (
    <div className="min-h-screen">
      <main className="mx-auto max-w-md px-4 pb-24 pt-6">{children}</main>
      <AiFab />
      <BottomNav />
    </div>
  );
}
