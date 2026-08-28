import { requireClient } from '@/lib/auth';
import { BottomNav } from '@/components/client/bottom-nav';
import { backgroundOf } from '@/lib/backgrounds';

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  // Server-side check — a coach account can never render this layout,
  // no matter what URL they type in.
  const user = await requireClient();

  /*
    The client's chosen background.

    This is the highest node rendered only for a signed-in client, which makes
    it the right place: the coach console and the sign-in screen keep the
    house look regardless of what any one client picked, and the root layout
    stays free of the auth and database call that reading it there would cost
    on every request to every route.
  */
  const background = backgroundOf(user.profile?.background);

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
    <div data-bg={background} className="min-h-screen">
      {/* Inside the themed element, so the frame is lit in whatever colour
          this client is wearing rather than in the default blue. */}
      <div aria-hidden className="viewport-frame" />
      <main className="mx-auto w-full max-w-md px-4 pb-24 pt-6 lg:max-w-5xl lg:px-10 lg:pb-28 lg:pt-12">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
