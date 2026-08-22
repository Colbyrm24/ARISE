'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NAV_ITEMS as items } from '@/components/coach/nav-items';
import { cn } from '@/lib/utils';

export function Sidebar({ pendingMeals = 0 }: { pendingMeals?: number }) {
  const pathname = usePathname();

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-background md:flex">
      {/* A pool of light behind the top of the rail, so the mark sits in
          something rather than on nothing. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-40 bg-[radial-gradient(ellipse_120%_80%_at_50%_0%,hsl(var(--system)/0.35),transparent_70%)]"
      />
      <div className="relative flex h-16 items-center px-6">
        {/* Was bg-clip-text with a transparent fill, which silently discards
            any text-shadow — the mark could never glow. Solid ink now. */}
        <span className="glow-mark text-lg font-semibold tracking-[0.2em] text-foreground">
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
                      ? 'glow-block glow-soft border border-accent/25 bg-accent/[0.09] text-foreground'
                      : 'text-muted-foreground hover:bg-secondary/50 hover:text-foreground hover:[text-shadow:0_0_14px_hsl(var(--accent)/0.45)]'
                  )}
                >
                  {active && (
                    <span className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_10px_2px_hsl(var(--accent)/0.9),0_0_30px_6px_hsl(var(--system)/0.7)]" />
                  )}
                  <Icon
                    size={18}
                    strokeWidth={active ? 2.25 : 1.75}
                    className={active ? 'glow-ink text-accent' : undefined}
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
