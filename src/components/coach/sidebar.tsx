'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Users,
  Inbox,
  ClipboardList,
  Dumbbell,
  UtensilsCrossed,
  CreditCard,
  Camera,
  CalendarDays,
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', icon: Users },
  { href: '/coach/inbox', label: 'Inbox', icon: Inbox },
  { href: '/coach/meals', label: 'Meals', icon: Camera, badge: 'pendingMeals' },
  { href: '/coach/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/coach/programs', label: 'Programs', icon: ClipboardList },
  { href: '/coach/exercises', label: 'Exercises', icon: Dumbbell },
  { href: '/coach/recipes', label: 'Recipes', icon: UtensilsCrossed },
  { href: '/coach/payments', label: 'Payments', icon: CreditCard },
  { href: '/coach/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar({ pendingMeals = 0 }: { pendingMeals?: number }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-background md:flex">
      <div className="flex h-16 items-center px-6">
        <span className="bg-gradient-to-r from-foreground to-foreground/70 bg-clip-text text-lg font-semibold tracking-[0.2em] text-transparent">
          ARISE
        </span>
      </div>
      <nav className="flex-1 px-3 py-2">
        <ul className="flex flex-col gap-1">
          {items.map((item) => {
            const { href, label, icon: Icon } = item;
            const active = pathname.startsWith(href);
            // Only ever a count of things waiting on him. A badge that shows a
            // total rather than a backlog is one he learns to ignore.
            const count = 'badge' in item && item.badge === 'pendingMeals' ? pendingMeals : 0;
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    'relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                    active
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground'
                  )}
                >
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-4 w-1 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.6)]" />
                  )}
                  <Icon
                    size={18}
                    strokeWidth={active ? 2.25 : 1.75}
                    className={active ? 'text-accent' : undefined}
                  />
                  <span className="flex-1">{label}</span>
                  {count > 0 && (
                    <span className="readout border border-accent/40 bg-accent/10 px-1.5 py-0.5 text-[10px] leading-none text-accent">
                      {count > 99 ? '99+' : count}
                    </span>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
