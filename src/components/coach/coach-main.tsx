'use client';

import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/*
  The program editor gets the whole screen. Its calendar is seven columns
  of workouts, and squeezed into the same reading width as a settings page
  each day was a narrow strip with truncated names. Everything else keeps
  the comfortable width.
*/
export function CoachMain({ children }: { children: React.ReactNode }) {
  const wide = /^\/coach\/programs\/[^/]+$/.test(usePathname() ?? '');
  return (
    <div className={cn('mx-auto px-6 py-8 md:px-10 md:py-10', wide ? 'max-w-[1900px] md:px-6' : 'max-w-6xl')}>
      {children}
    </div>
  );
}
