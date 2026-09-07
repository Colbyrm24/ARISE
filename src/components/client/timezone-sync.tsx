'use client';

import { useEffect, useRef } from 'react';
import { saveClientTimezone } from '@/app/(client)/timezone-actions';

/*
  Tells the server which zone this client is actually in.

  Renders nothing. Mounted once in the client layout so it runs on whichever
  screen they happen to open first, rather than on a settings page they may
  never visit — see timezone-actions.ts for what the default was doing to
  everybody's day.

  `stored` is what the profile currently holds, so the common case (nothing
  changed) makes no request at all. The server re-checks this anyway; the
  comparison here is only to keep the network quiet.
*/
export function TimezoneSync({ stored }: { stored: string | null | undefined }) {
  // Once per mount, whatever React does with effects in development.
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current) return;

    let detected: string | undefined;
    try {
      detected = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
      return;
    }
    if (!detected || detected === stored) return;

    sent.current = true;
    /*
      Deliberately unawaited and swallowed. This is a background correction,
      not something the client asked for — if it fails they should see the
      screen they opened, not an error about a setting they never touched. It
      will simply try again on the next page load.
    */
    void saveClientTimezone(detected).catch(() => {});
  }, [stored]);

  return null;
}
