'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Sun, Dumbbell, Apple, MessageCircle, CircleUser } from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/workouts', label: 'Workouts', icon: Dumbbell },
  { href: '/nutrition', label: 'Nutrition', icon: Apple },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/profile', label: 'Profile', icon: CircleUser },
] as const;

/**
 * The entire client navigation. Five items, nothing more — the brief
 * was explicit: don't add tabs just because a feature exists.
 */
export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-accent/25 bg-background/95 shadow-[0_-1px_0_hsl(var(--accent)/0.35),0_-14px_46px_-10px_hsl(var(--system)/0.7)] backdrop-blur">
      <ul className="mx-auto flex max-w-md items-stretch justify-between px-2 pb-[env(safe-area-inset-bottom)]">
        {items.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  'relative flex flex-col items-center gap-1 py-3 text-[11px] font-medium transition-colors',
                  active ? 'glow-soft text-accent' : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {active && (
                  <>
                    {/* The lit tick, plus the pool of light it sits in. */}
                    <span className="absolute top-1.5 h-1 w-1 rounded-full bg-accent shadow-[0_0_8px_2px_hsl(var(--accent)),0_0_22px_5px_hsl(var(--system)/0.8)]" />
                    <span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-1 bottom-0 top-0 bg-[radial-gradient(ellipse_80%_70%_at_50%_0%,hsl(var(--accent)/0.22),transparent_72%)]"
                    />
                  </>
                )}
                <Icon size={22} strokeWidth={active ? 2.25 : 1.75} className={active ? 'glow-ink' : undefined} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
