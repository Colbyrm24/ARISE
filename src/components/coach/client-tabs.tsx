'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

/*
  The tabs across a client's workspace.

  A client component only because the active tab has to come from the URL,
  and `usePathname` is the only way to read it without threading the path
  through every page. Everything the tabs point at stays a server component.
*/

const TABS = [
  { segment: '', label: 'Overview' },
  { segment: 'meals', label: 'Meals' },
  { segment: 'habits', label: 'Habits' },
  { segment: 'progress', label: 'Progress' },
  { segment: 'account', label: 'Account' },
] as const;

export function ClientTabs({ clientId }: { clientId: string }) {
  const pathname = usePathname();
  const base = `/coach/clients/${clientId}`;

  return (
    <nav
      aria-label="Client sections"
      className="-mx-1 flex gap-1 overflow-x-auto border-b border-border/70 pb-px"
    >
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        /*
          Exact match for Overview, prefix match for the rest. Without the
          exact check Overview stays lit on every other tab, because every
          path in here starts with the base.
        */
        const active = tab.segment ? pathname.startsWith(href) : pathname === base;

        return (
          <Link
            key={tab.label}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'readout shrink-0 border-b-2 px-3 py-2.5 text-[11px] uppercase tracking-wider transition-colors',
              active
                ? 'border-accent text-accent'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
