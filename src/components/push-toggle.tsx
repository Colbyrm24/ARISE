'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { savePushSubscription, deletePushSubscription } from '@/app/push-actions';

/*
  The opt-in control for web push.

  Most of the code here is about telling the truth. Push has three separate
  ways of being unavailable — the browser doesn't support it, iOS needs the app
  on the home screen first, or the person already denied permission — and each
  needs a different sentence. A single "enable notifications" button that does
  nothing on an iPhone is worse than no button.
*/

type State =
  | 'loading'
  | 'unconfigured' // no VAPID key on this deployment yet
  | 'unsupported'
  | 'needs-install' // iOS Safari, not yet added to the home screen
  | 'denied'
  | 'off'
  | 'on'
  | 'working';

/** VAPID keys travel as base64url; the browser wants raw bytes. */
function urlBase64ToUint8Array(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=');
  const raw = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

function isIos() {
  if (typeof navigator === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    // iPadOS reports as Mac, so touch points are the giveaway.
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // Safari's own flag, which predates the standard one.
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const [state, setState] = useState<State>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      // No key on this deployment yet. Render nothing rather than telling
      // someone their browser is at fault when it isn't.
      if (!vapidPublicKey) return setState('unconfigured');
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        // On iOS this is what an ordinary Safari tab looks like, and the fix
        // is Add to Home Screen rather than "your browser is too old".
        return setState(isIos() && !isStandalone() ? 'needs-install' : 'unsupported');
      }
      if (Notification.permission === 'denied') return setState('denied');

      try {
        const reg = await navigator.serviceWorker.register('/sw.js');
        const existing = await reg.pushManager.getSubscription();
        if (!cancelled) setState(existing ? 'on' : 'off');

        /*
          Re-register what the browser already has, every time this loads.

          The two sides could drift apart with nothing to pull them back.
          Push endpoints rotate — routinely, on mobile — and when one does,
          the next send gets a 410 and lib/push.ts deletes our row. The
          browser's subscription object still exists, so this toggle went on
          saying "On" while the client received nothing, forever, and neither
          they nor the coach was told. For an app whose entire reach-the-phone
          story is push, that is churn you never see happen.

          savePushSubscription upserts on the endpoint, so re-sending the
          same live one costs a write and changes nothing. Deliberately not
          awaited into the render path and deliberately silent: this is
          repair, and if it fails the toggle below is still the real fix.
        */
        if (existing) {
          const json = existing.toJSON() as {
            endpoint?: string;
            keys?: { p256dh?: string; auth?: string };
          };
          if (json.endpoint && json.keys?.p256dh && json.keys?.auth) {
            void savePushSubscription({
              endpoint: json.endpoint,
              p256dh: json.keys.p256dh,
              auth: json.keys.auth,
              userAgent: navigator.userAgent,
            }).catch(() => {});
          }
        }
      } catch {
        if (!cancelled) setState('unsupported');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [vapidPublicKey]);

  async function enable() {
    setError(null);
    setState('working');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setState(permission === 'denied' ? 'denied' : 'off');
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
      });

      const json = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
      const res = await savePushSubscription({
        endpoint: json.endpoint ?? '',
        p256dh: json.keys?.p256dh ?? '',
        auth: json.keys?.auth ?? '',
        userAgent: navigator.userAgent,
      });

      if (!res.ok) {
        // Don't leave a live browser subscription pointing at a row we failed
        // to store — that's a device that can never be reached or cleaned up.
        await sub.unsubscribe().catch(() => {});
        setError(res.error ?? 'Could not turn those on.');
        setState('off');
        return;
      }
      setState('on');
    } catch {
      setError('Could not turn those on.');
      setState('off');
    }
  }

  async function disable() {
    setState('working');
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await deletePushSubscription(sub.endpoint);
        await sub.unsubscribe();
      }
      setState('off');
    } catch {
      setState('on');
    }
  }

  if (state === 'loading' || state === 'unconfigured') return null;

  const note = (text: string) => (
    <p className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">{text}</p>
  );

  if (state === 'needs-install') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BellOff size={15} className="text-muted-foreground" />
          <span className="text-sm font-medium">Notifications</span>
        </div>
        {note(
          'On iPhone, tap share then Add to Home Screen, open ARISE from there, and this turns on.'
        )}
      </div>
    );
  }

  if (state === 'unsupported') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BellOff size={15} className="text-muted-foreground" />
          <span className="text-sm font-medium">Notifications</span>
        </div>
        {note('This browser cannot receive them.')}
      </div>
    );
  }

  if (state === 'denied') {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <BellOff size={15} className="text-destructive" />
          <span className="text-sm font-medium">Notifications blocked</span>
        </div>
        {note('Allow notifications for this site in your browser settings, then reload.')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          {state === 'on' ? (
            <Bell size={15} className="text-accent" />
          ) : (
            <BellOff size={15} className="text-muted-foreground" />
          )}
          <span className="text-sm font-medium">Notifications</span>
        </span>
        <Button
          type="button"
          size="sm"
          variant={state === 'on' ? 'outline' : 'primary'}
          disabled={state === 'working'}
          onClick={state === 'on' ? disable : enable}
        >
          {state === 'working' ? '…' : state === 'on' ? 'Turn off' : 'Turn on'}
        </Button>
      </div>
      {note(
        state === 'on'
          ? 'On for this device. Each phone or laptop is turned on separately.'
          : 'Get a push when your coach messages you or your program changes.'
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
