'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setLoading(false);

    if (signInError) {
      setError('That email and password don’t match. Try again.');
      return;
    }

    /*
      Only ever a path on this site. `?next=https://evil.com` used to send
      somebody straight off the domain the instant after they typed their
      password — the classic phishing finish. A leading slash that isn't a
      protocol-relative `//` is the whole test.
    */
    const raw = searchParams.get('next') ?? '';
    const next = /^\/(?!\/)/.test(raw) ? raw : '/';
    router.push(next);
    router.refresh();
  }

  return (
    <SystemWindow title="Sign in">
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
          <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between">
              <Label htmlFor="password">Password</Label>
              {/* Without this there was no way back into an account at all —
                  a forgotten password meant the coach resetting it by hand
                  in the Supabase dashboard, for every client, forever. */}
              <Link
                href="/forgot-password"
                className="text-xs text-muted-foreground transition-colors hover:text-accent"
              >
                Forgot?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={loading} className="mt-2 w-full">
            {loading ? 'Signing in…' : 'Sign in'}
          </Button>
        </form>
      </SystemWindowContent>
      <div className="border-t border-border p-5 text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link href="/signup" className="text-accent hover:underline">
          Start coaching
        </Link>
      </div>
    </SystemWindow>
  );
}
