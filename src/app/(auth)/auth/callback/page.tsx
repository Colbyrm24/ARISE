'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';

/**
 * Where every emailed auth link lands.
 *
 * Until this existed there was no such place, so a magic link, a password
 * reset and a signup confirmation all dropped the person on the site root
 * carrying a token nothing ever read. The middleware saw no session cookie
 * and bounced them to /login — the link looked broken because, end to end,
 * it was.
 *
 * Supabase hands the session back in three different shapes depending on
 * which flow minted the link, and the dashboard, the client SDK and the
 * older email templates do not agree on which. So rather than guess, this
 * reads all three:
 *
 *   #access_token & #refresh_token   implicit flow (dashboard magic links)
 *   ?code                            PKCE
 *   ?token_hash & ?type              the newer email templates
 *
 * It has to run in the browser: the fragment form is never sent to the
 * server, so a route handler physically cannot see it. createBrowserClient
 * writes the session to cookies, which is what makes the server components
 * on the very next navigation see a signed-in user.
 */
export default function AuthCallbackPage() {
  return (
    <Suspense fallback={<Waiting />}>
      <Callback />
    </Suspense>
  );
}

type OtpType =
  | 'email'
  | 'signup'
  | 'invite'
  | 'magiclink'
  | 'recovery'
  | 'email_change';

function Callback() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  /*
    React 18 runs effects twice in development. Consuming a one-time token
    twice makes the second call fail and show an error over a sign-in that
    actually worked, so this only ever runs once.
  */
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    (async () => {
      const supabase = createClient();
      const url = new URL(window.location.href);
      const query = url.searchParams;
      const hash = new URLSearchParams(url.hash.replace(/^#/, ''));

      // Supabase reports its own failures (expired link, already used) here.
      const reported =
        query.get('error_description') ?? hash.get('error_description');
      if (reported) {
        setError(reported);
        return;
      }

      const type = (query.get('type') ?? hash.get('type')) as OtpType | null;
      const code = query.get('code');
      const tokenHash = query.get('token_hash');
      const accessToken = hash.get('access_token');
      const refreshToken = hash.get('refresh_token');

      let failure: string | null = null;

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        failure = error?.message ?? null;
      } else if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        failure = error?.message ?? null;
      } else if (tokenHash) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type ?? 'email',
        });
        failure = error?.message ?? null;
      } else {
        /*
          detectSessionInUrl is on by default, so the client may have eaten
          the fragment before this effect ran. A session already sitting
          there means the link worked — no session means there was never a
          usable token in the URL at all.
        */
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          failure = 'That link has expired or has already been used.';
        }
      }

      if (failure) {
        setError(failure);
        return;
      }

      /*
        A recovery link exists so somebody can set a new password. Everything
        else just wants the app, and the root routes on role — which only the
        server can read, because role lives in our own users table.
      */
      router.replace(type === 'recovery' ? '/auth/reset-password' : '/');
      router.refresh();
    })();
  }, [router]);

  if (error) {
    return (
      <SystemWindow title="Link expired">
        <SystemWindowContent className="pt-4">
          <p className="text-sm text-muted-foreground">{error}</p>
          <p className="mt-4 text-sm text-muted-foreground">
            Ask for a new one and it&rsquo;ll work.
          </p>
          <div className="mt-5 flex flex-col gap-2 text-sm">
            <Link href="/forgot-password" className="text-accent hover:underline">
              Send a new link
            </Link>
            <Link href="/login" className="text-muted-foreground hover:underline">
              Back to sign in
            </Link>
          </div>
        </SystemWindowContent>
      </SystemWindow>
    );
  }

  return <Waiting />;
}

function Waiting() {
  return (
    <SystemWindow title="Signing you in">
      <SystemWindowContent className="pt-4">
        <p className="text-sm text-muted-foreground">One second&hellip;</p>
      </SystemWindowContent>
    </SystemWindow>
  );
}
