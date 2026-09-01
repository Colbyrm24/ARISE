'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

/*
  Account, then payment, without stopping in between.

  The old signup dropped people on the intake form and the coach then had to
  chase them for money separately. Here the submit button does the whole
  thing: create the account, hand the invite to the server, and go wherever
  the server says — which is Stripe, with the price the coach chose already
  on it.

  The redirect is a hard `location.assign` rather than a router push because
  the destination is Stripe's domain, not a route in this app.
*/
export function JoinForm({
  token,
  defaultName,
  skipPayment = false,
}: {
  token: string;
  defaultName: string;
  skipPayment?: boolean;
}) {
  const [fullName, setFullName] = useState(defaultName);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const supabase = createClient();
    const { data: signUp, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    /*
      They may already have an account.

      This was a hard dead end: anybody who had signed up before — looked at
      the app months ago, or was sent a second link — got Supabase's raw
      "User already registered" and no way past it, on the one screen that
      turns an invite into a client. It is exactly the person being moved
      across from another platform.

      So a failed signup is retried as a sign-in with the same details. If
      that works they are the same person and the request carries on; the
      route knows how to attach an existing account to the coach. If it
      doesn't, they get a sentence in English and a link to sign in, not a
      library's error string.
    */
    let session = signUp?.session ?? null;

    if (signUpError || !session) {
      const { data: signIn, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      session = signIn?.session ?? null;

      if (!session) {
        setLoading(false);
        setError(
          signUpError
            ? 'There is already an account with that email. Sign in first, then open this link again.'
            : signInError
              ? 'Check your email to confirm your account, then open this link again.'
              : 'Something went wrong making your account. Try again in a moment.'
        );
        return;
      }
    }

    const res = await fetch('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fullName }),
    });

    const data = await res.json().catch(() => ({}));

    /*
      An existing client — already paying somewhere else — has no checkout to
      go to. The route sends them straight to the intake instead, and this
      branch has to come first: the checkoutUrl guard below treats a missing
      URL as a failure, so without this they would land on the "something went
      wrong" message after a signup that worked perfectly.
    */
    if (res.ok && typeof data.redirectTo === 'string') {
      window.location.assign(data.redirectTo);
      return;
    }

    if (!res.ok || !data.checkoutUrl) {
      setLoading(false);
      /*
        The account exists at this point even when the payment step failed,
        so never tell them to start again — send them to the waiting screen,
        where their coach can pick it up.
      */
      setError(
        (data.error as string) ??
          'Something went wrong opening the payment page. Your account is made — message your coach.'
      );
      return;
    }

    window.location.assign(data.checkoutUrl as string);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          required
          autoComplete="name"
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

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'One second…' : skipPayment ? 'Create account' : 'Create account and pay'}
      </Button>
    </form>
  );
}
