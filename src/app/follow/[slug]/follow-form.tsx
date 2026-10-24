'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/*
  Account, age, payment — one button.

  The same shape as the invite form: make (or sign into) the Supabase account
  in the browser, hand the rest to the server, and go wherever it says, which
  is Stripe Checkout. A person who is already signed in skips straight to the
  server step with nothing to type but, if we don't have it, their birthday.
*/

type Mode = 'new' | 'signed-in';

export function FollowForm({
  slug,
  mode,
  needsBirthDate,
  priceLabel,
}: {
  slug: string;
  mode: Mode;
  needsBirthDate: boolean;
  priceLabel: string;
}) {
  const [firstName, setFirstName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!agreed) {
      setError('Tick the box to confirm your age and the terms.');
      return;
    }
    setLoading(true);

    if (mode === 'new') {
      const supabase = createClient();
      const { data: signUp, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: firstName } },
      });

      // Already has an account: try those details as a sign-in, as the
      // invite form does, and only then explain.
      let session = signUp?.session ?? null;
      if (signUpError || !session) {
        const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        session = signIn?.session ?? null;
        if (!session) {
          setLoading(false);
          const reason = (signInError?.message ?? signUpError?.message ?? '').toLowerCase();
          setError(
            reason.includes('invalid login credentials')
              ? 'That email already has an account and the password does not match. Sign in first, then come back to this page.'
              : reason.includes('not confirmed')
                ? 'Check your email to confirm your account, then come back to this page.'
                : signUpError?.message ||
                    signInError?.message ||
                    'Something went wrong making your account. Try again in a moment.'
          );
          return;
        }
      }
    }

    let res: Response;
    try {
      res = await fetch('/api/follow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, firstName, birthDate }),
      });
    } catch {
      setLoading(false);
      setError('Lost connection. Your account is made — reload this page and tap subscribe again.');
      return;
    }

    const data = await res.json().catch(() => ({}));
    if (res.ok && typeof data.redirectTo === 'string') {
      window.location.assign(data.redirectTo);
      return;
    }
    if (!res.ok || typeof data.checkoutUrl !== 'string') {
      setLoading(false);
      setError((data.error as string) ?? 'The payment page would not open. Try again in a minute.');
      return;
    }
    window.location.assign(data.checkoutUrl);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {mode === 'new' && (
        <>
          <div className="flex flex-col gap-2">
            <Label htmlFor="firstName">First name</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              required
              autoComplete="given-name"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
            />
          </div>
        </>
      )}

      {needsBirthDate && (
        <div className="flex flex-col gap-2">
          <Label htmlFor="birthDate">Date of birth</Label>
          <Input
            id="birthDate"
            type="date"
            value={birthDate}
            onChange={(e) => setBirthDate(e.target.value)}
            required
            autoComplete="bday"
          />
        </div>
      )}

      <label className="flex items-start gap-3 text-xs leading-relaxed text-muted-foreground">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
        />
        <span>
          I&apos;m 13 or older, and if I&apos;m under 18 I have a parent or guardian&apos;s
          permission. I agree to the{' '}
          <Link href="/terms" className="text-accent hover:underline">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/privacy" className="text-accent hover:underline">
            privacy policy
          </Link>
          .
        </span>
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'One second…' : `Subscribe · ${priceLabel}`}
      </Button>
    </form>
  );
}

/**
 * Counts this look at the page, once per browser per day. The id is random
 * and lives only in this browser.
 */
export function VisitBeacon({ offerId }: { offerId: string }) {
  useEffect(() => {
    let visitor = '';
    try {
      visitor = localStorage.getItem('arise-visitor') ?? '';
      if (!visitor) {
        visitor =
          typeof crypto !== 'undefined' && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
        localStorage.setItem('arise-visitor', visitor);
      }
    } catch {
      // Private mode or storage blocked: count it with a throwaway id.
      visitor = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
    }
    fetch('/api/follow/visit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ offerId, visitor }),
      keepalive: true,
    }).catch(() => null);
  }, [offerId]);
  return null;
}
