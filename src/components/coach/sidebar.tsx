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
  Settings,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const items = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', icon: Users },
  { href: '/coach/inbox', label: 'Inbox', icon: Inbox },
  { href: '/coach/programs', label: 'Programs', icon: ClipboardList },
  { href: '/coach/exercises', label: 'Exercises', icon: Dumbbell },
  { href: '/coach/recipes', label: 'Recipes', icon: UtensilsCrossed },
  { href: '/coach/payments', label: 'Payments', icon: CreditCard },
  { href: '/coach/settings', label: 'Settings', icon: Settings },
] as const;

export function Sidebar() {
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
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
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
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
