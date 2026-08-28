'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { NAV_ITEMS, type BadgeCounts } from '@/components/coach/nav-items';
import { cn } from '@/lib/utils';

/*
  The coach console on a phone.

  The sidebar is `hidden md:flex`, and the mobile header held nothing but the
  wordmark. Below 768px a coach could reach the dashboard and then nothing at
  all — no clients, no inbox, no meals queue. Which is most of a working day,
  since the phone is where the coach actually is.

  A sheet rather than a squeezed-down rail: eight destinations don't fit a
  bottom bar, and the coach opens this to go somewhere specific rather than
  to flick between two screens.
*/

export function CoachMobileNav({ counts = {} }: { counts?: BadgeCounts }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // The closed button can't show numbers, only that there is something behind
  // it — so any backlog at all lights the dot.
  const anyBacklog = Object.values(counts).some((n) => (n ?? 0) > 0);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        className="relative flex h-11 w-11 items-center justify-center border border-border text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent"
      >
        <Menu size={18} />
        {anyBacklog && (
          <span className="absolute -right-1 -top-1 h-2 w-2 bg-accent shadow-[0_0_8px_hsl(var(--accent)/0.8)]" />
        )}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-background/80"
          />

          <nav className="absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col border-l border-border bg-card">
            <div className="flex h-16 items-center justify-between px-5">
              <span className="readout text-[10px] uppercase tracking-wider text-muted-foreground">
                Console
              </span>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close menu"
                className="flex h-11 w-11 items-center justify-center text-muted-foreground transition-colors hover:text-foreground"
              >
                <X size={18} />
              </button>
            </div>

            <ul className="flex flex-1 flex-col overflow-y-auto px-3 pb-6">
              {NAV_ITEMS.map((item) => {
                const active = pathname.startsWith(item.href);
                const Icon = item.icon;
                const count = item.badge ? counts[item.badge] ?? 0 : 0;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'flex min-h-12 items-center gap-3 border-b border-border/40 px-2 text-sm transition-colors',
                        active
                          ? 'glow-soft text-accent'
                          : 'text-muted-foreground hover:text-foreground'
                      )}
                    >
                      <Icon size={17} className={active ? 'glow-ink text-accent' : undefined} />
                      <span className="flex-1">{item.label}</span>
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
        </div>
      )}
    </>
  );
}
