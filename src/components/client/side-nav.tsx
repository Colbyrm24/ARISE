'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Sun,
  Dumbbell,
  Apple,
  TrendingUp,
  ClipboardCheck,
  MessageCircle,
  CalendarClock,
  Bell,
  CircleUser,
} from 'lucide-react';
import { cn } from '@/lib/utils';

/*
  The client's own side panel, on a screen wide enough to hold one.

  The coach console has had this since it was built and it is the thing that
  makes it feel navigable — every section named, all of them visible at once,
  nothing hiding behind a tab bar that only fits five. Clients have the same
  number of places to be and, until now, five of them were reachable and the
  rest were not linked from anywhere.

  Phones keep the bottom bar. A fixed left rail on a 390px screen is a rail
  eating a third of the app, and the five things a client touches daily should
  stay one thumb-reach away. So this appears from lg up, where the layout
  already widens into two columns, and the bottom bar steps aside for it.
*/

const ITEMS = [
  { href: '/today', label: 'Today', icon: Sun },
  { href: '/workouts', label: 'Workouts', icon: Dumbbell },
  { href: '/nutrition', label: 'Nutrition', icon: Apple },
  { href: '/progress', label: 'Progress', icon: TrendingUp },
  { href: '/check-in', label: 'Check-in', icon: ClipboardCheck },
  { href: '/messages', label: 'Messages', icon: MessageCircle },
  { href: '/book', label: 'Book a call', icon: CalendarClock },
  { href: '/notifications', label: 'Notifications', icon: Bell },
  { href: '/profile', label: 'Profile', icon: CircleUser },
] as const;

export function SideNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="Sections"
      className="fixed inset-y-0 left-0 z-40 hidden w-56 flex-col border-r border-accent/20 bg-background/95 px-3 py-8 backdrop-blur lg:flex"
    >
      <span className="readout mb-8 px-3 text-sm uppercase tracking-[0.3em] text-accent glow-soft">
        Arise
      </span>

      <ul className="flex flex-col gap-0.5">
        {ITEMS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'relative flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
                  active
                    ? 'glow-soft bg-accent/10 text-accent'
                    : 'text-muted-foreground hover:bg-secondary/40 hover:text-foreground'
                )}
              >
                {/* The lit edge that marks the current section, same idea as
                    the tick on the bottom bar. */}
                {active && (
                  <span
                    aria-hidden
                    className="absolute inset-y-1 left-0 w-0.5 bg-accent shadow-[0_0_10px_2px_hsl(var(--accent)/0.8)]"
                  />
                )}
                <Icon size={18} strokeWidth={active ? 2.25 : 1.75} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
