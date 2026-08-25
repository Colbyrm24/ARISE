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
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    const supabase = createClient();
    /*
      redirectTo is passed explicitly rather than leaning on the project's
      Site URL. The Site URL was pointed at localhost for months and every
      auth email in that window was dead on arrival; naming the destination
      here means a config change somewhere else can't silently break it
      again.
    */
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });

    setLoading(false);
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
