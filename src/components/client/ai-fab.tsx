'use client';

import Link from 'next/link';
import { Sparkles } from 'lucide-react';

/**
 * Floating "AI Coach" entry point, reachable from anywhere in the client
 * app. Sits above the bottom nav so it never gets covered by it.
 */
export function AiFab() {
  return (
    <Link
      href="/ai"
      className="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] right-4 z-50 flex h-13 w-13 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-lg shadow-black/30 transition-transform active:scale-95"
      aria-label="Ask AI Coach"
    >
      <Sparkles size={22} strokeWidth={2} />
    </Link>
  );
}
