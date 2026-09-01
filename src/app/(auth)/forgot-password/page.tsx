'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';

/**
 * Ask for a reset link.
 *
 * Deliberately says the same thing whether or not the address has an
 * account. Telling a stranger "no account with that email" turns this form
 * into a way to find out who your clients are.
 */

/*
  Did the mail fail to go out, or did Supabase decline to say anything about
  this address?

  Only the first kind gets shown. Rate limiting and provider/network failures
  are facts about the mail system and are identical for an address that exists
  and one that doesn't, so surfacing them tells an attacker nothing. Anything
  else — including a refusal tied to the address — falls through to the
  generic screen, which is the whole point of that screen.
*/
function isDeliveryFailure(err: { message?: string; status?: number; code?: string }) {
  const code = err.code ?? '';
  const status = err.status ?? 0;
  const text = (err.message ?? '').toLowerCase();

  if (status === 429 || code.includes('rate_limit') || text.includes('rate limit')) return true;
  if (status >= 500) return true;
  // A thrown fetch failure arrives with no status at all.
  if (!status && (text.includes('failed to fetch') || text.includes('network'))) return true;
  return false;
}

function deliveryMessage(err: { message?: string; status?: number; code?: string }) {
  const code = err.code ?? '';
  const status = err.status ?? 0;
  const text = (err.message ?? '').toLowerCase();

  if (status === 429 || code.includes('rate_limit') || text.includes('rate limit')) {
    return 'Too many reset emails have gone out in the last hour. Give it an hour and try again, or message your coach and they can let you straight in.';
  }
  if (!status) {
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return "Something went wrong sending that email — it's on our end, not yours. Try again in a few minutes, or message your coach.";
}
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    /*
      redirectTo is passed explicitly rather than leaning on the project's
      Site URL. The Site URL was pointed at localhost for months and every
      auth email in that window was dead on arrival; naming the destination
      here means a config change somewhere else can't silently break it
      again.
    */
    const { error: sendError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setLoading(false);

    /*
      The result used to be thrown away, and the screen said "a reset link is
      on its way" no matter what happened. On a project capped at two auth
      emails an hour that is the common case, not the rare one: somebody hits
      the cap, gets told to check their inbox, and waits for a mail that was
      never sent. Then they email their coach.

      Rate limits and outages say nothing about whether an account exists, so
      showing them leaks nothing — the reason the copy is vague is to keep
      this form from being a way to enumerate clients, and that only applies
      to errors about the address itself. Those still land on the generic
      success screen.
    */
    if (sendError && isDeliveryFailure(sendError)) {
      setError(deliveryMessage(sendError));
      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <SystemWindow title="Check your email">
        <SystemWindowContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            If there&rsquo;s an account for {email}, a reset link is on its way.
            It&rsquo;s good for one hour.
          </p>
          <div className="mt-5 text-sm">
            <Link href="/login" className="text-accent hover:underline">
              Back to sign in
            </Link>
          </div>
        </SystemWindowContent>
      </SystemWindow>
    );
  }

  return (
    <SystemWindow title="Reset password">
      <SystemWindowContent className="pt-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-foreground"
            >
              {error}
            </p>
          )}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Sending…' : 'Send reset link'}
          </Button>
        </form>
      </SystemWindowContent>
      <div className="border-t border-border p-5 text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </div>
    </SystemWindow>
  );
}
