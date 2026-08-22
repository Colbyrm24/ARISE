'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sparkles } from 'lucide-react';

/**
 * Floating "AI Coach" entry point, reachable from anywhere in the client app.
 *
 * Two things were wrong. It was sized `h-13 w-13`, which is not a class —
 * Tailwind's default scale has no 13 — so it collapsed to the icon's own size,
 * roughly 22px, well under the 44px a thumb needs. And it rendered on every
 * screen including /messages, where it sat directly on top of the Send button,
 * and /ai, where it linked to the page you were already on.
 */
export function AiFab() {
  const pathname = usePathname();
  if (pathname.startsWith('/ai') || pathname.startsWith('/messages')) return null;

  return (
    <Link
      href="/ai"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-black/30 transition-transform active:scale-95"
      aria-label="Ask AI Coach"
    >
      <Sparkles size={22} strokeWidth={2} />
    </Link>
  );
}
