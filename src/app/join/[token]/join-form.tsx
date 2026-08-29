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
export function JoinForm({ token, defaultName }: { token: string; defaultName: string }) {
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
    const { error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { full_name: fullName } },
    });

    if (signUpError) {
      setLoading(false);
      setError(signUpError.message);
      return;
    }

    const res = await fetch('/api/auth/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, fullName }),
    });

    const data = await res.json().catch(() => ({}));

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
        {loading ? 'One second…' : 'Create account and pay'}
      </Button>
    </form>
  );
}
