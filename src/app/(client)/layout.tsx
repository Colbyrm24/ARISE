import { requireClient } from '@/lib/auth';
import { BottomNav } from '@/components/client/bottom-nav';
import { AiFab } from '@/components/client/ai-fab';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  // Server-side check — a coach account can never render this layout,
  // no matter what URL they type in.
  await requireClient();

  /*
    Two shapes, one app.

    This is a phone app first and that isn't changing — but it is also a
    website, and a 448px column centred in a 1600px window is mostly empty
    room. Below lg nothing moves. At lg the column widens and the screens
    inside lay themselves out in more than one column.

    Capped rather than fluid on purpose: a client's day is a small amount of
    information, and stretched edge to edge on a wide monitor the eye has to
    cross half a metre of screen to read one line. Wide enough for two
    columns, and no wider.
  */
  return (
    <div className="min-h-screen">
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-6 lg:max-w-5xl lg:px-10 lg:pb-28 lg:pt-12">
        {children}
      </main>
      <AiFab />
      <BottomNav />
    </div>
  );
}
