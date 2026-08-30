'use client';

import { useState } from 'react';
import { CreditCard } from 'lucide-react';

/*
  Opens Stripe's own billing page.

  A client whose card starts declining previously had nowhere to go: the
  failure was shown to the coach, and the person who could actually fix it
  was told nothing and given no button. This is that button.

  The redirect is a hard `location.assign` because the destination is
  Stripe's domain, not a route in this app — and the session it opens is
  created server-side against the customer on the signed-in user's own row,
  never against an id this component could pass.
*/
export function ManageBillingButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/billing-portal', { method: 'POST' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) {
        setBusy(false);
        setError((data.error as string) ?? 'Could not open the billing page.');
        return;
      }
      window.location.assign(data.url as string);
    } catch {
      setBusy(false);
      setError('Could not open the billing page.');
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className="readout inline-flex w-fit items-center gap-1.5 border border-border px-2.5 py-1.5 text-[10px] uppercase tracking-wider text-muted-foreground transition-colors hover:border-accent/60 hover:text-accent disabled:opacity-50"
      >
        <CreditCard size={12} />
        {busy ? 'Opening…' : 'Update payment method'}
      </button>
      {error && <p className="text-xs leading-relaxed text-destructive">{error}</p>}
    </div>
  );
}
