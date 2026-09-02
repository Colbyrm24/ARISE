'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';

export default function SignupPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

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

    /*
      Mirror the new user into our own database (profile + client record).

      Wrapped and checked, because the Supabase account exists by this line
      and every screen in the app joins against OUR users table. An unguarded
      call meant a dropped connection left the button reading "Creating
      account…" forever, and a 500 was ignored entirely — the push to
      /onboarding below fired regardless, on an account with nothing behind
      it. getCurrentUser now repairs a missing row rather than looping, so
      this is no longer fatal, but a person should still be told rather than
      quietly handed a half-made account.
    */
    try {
      const res = await fetch('/api/auth/complete-signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fullName }),
      });
      if (!res.ok) {
        setLoading(false);
        setError(
          'Your account was created but we could not finish setting it up. Try signing in — if that does not work, message your coach.'
        );
        return;
      }
    } catch {
      setLoading(false);
      setError(
        'Lost connection before we could finish. Your account was created — try signing in.'
      );
      return;
    }

    setLoading(false);
    // Straight into intake. A client who lands on /today first almost never
    // comes back to fill this in, and then the coach is programming blind —
    // /onboarding saves section by section, so stopping halfway still leaves
    // something useful behind.
    router.push('/onboarding');
    router.refresh();
  }

  return (
    <SystemWindow title="Create account">
      <SystemWindowContent className="pt-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="fullName">Full name</Label>
            <Input
              id="fullName"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Jake Miller"
            />
          </div>
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
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Creating account…' : 'Create account'}
          </Button>
        </form>
      </SystemWindowContent>
      <div className="border-t border-border p-5 text-center text-sm text-muted-foreground">
        Already coaching with us?{' '}
        <Link href="/login" className="text-accent hover:underline">
          Sign in
        </Link>
      </div>
    </SystemWindow>
  );
}
