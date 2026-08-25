'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';

/**
 * Set a new password.
 *
 * Only reachable holding a live recovery session, which /auth/callback puts
 * in place before sending anyone here. Landing on this page cold means the
 * link expired or somebody typed the URL, and there is nothing to update —
 * so it says that instead of showing a form that cannot work.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState<'checking' | 'ok' | 'no-session'>(
    'checking'
  );
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const supabase = createClient();
      const { data } = await supabase.auth.getSession();
      setReady(data.session ? 'ok' : 'no-session');
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Checked here rather than by the browser so the two messages read the
    // same way, and so the rule is visible before they submit.
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }
    if (password !== confirm) {
      setError('Those two don’t match.');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // Already signed in at this point — the recovery session is a real one.
    router.replace('/');
    router.refresh();
  }

  if (ready === 'checking') {
    return (
      <SystemWindow title="Set a password">
        <SystemWindowContent className="pt-4">
          <p className="text-sm text-muted-foreground">One second&hellip;</p>
        </SystemWindowContent>
      </SystemWindow>
    );
  }

  if (ready === 'no-session') {
    return (
      <SystemWindow title="Link expired">
        <SystemWindowContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            This page only works from a fresh reset link.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <Link href="/forgot-password" className="text-accent hover:underline">
              Send a new one
            </Link>
            <Link href="/login" className="text-muted-foreground hover:underline">
              Back to sign in
            </Link>
          </div>
        </SystemWindowContent>
      </SystemWindow>
    );
  }

  return (
    <SystemWindow title="Set a password">
      <SystemWindowContent className="pt-4">
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="At least 8 characters"
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="confirm">Again</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <Button type="submit" disabled={saving} className="mt-2 w-full">
            {saving ? 'Saving…' : 'Save and continue'}
          </Button>
        </form>
      </SystemWindowContent>
    </SystemWindow>
  );
}
