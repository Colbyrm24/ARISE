/*
  Which "put ARISE on your home screen" instructions a phone needs.

  ARISE ships as a web app, and on an iPhone that is only half an app until it
  is added to the home screen: no icon, browser bars round every screen, and —
  the part that matters — no notifications at all, because iOS only grants web
  push to home-screen apps. Nobody finds Share → Add to Home Screen on their
  own, so the client app asks, once, with the taps for the phone in hand.

  Kept free of window and navigator so the decision can be tested; the
  component passes in what the browser reports.
*/

export type InstallPlatform =
  | 'installed' //        already opened from the home screen — say nothing
  | 'ios-safari' //       Share → Add to Home Screen
  | 'ios-other' //        Chrome/Edge/Firefox on iOS: same, Share sits in the address bar
  | 'ios-in-app' //       Instagram/Facebook/etc. browser: cannot install, open in Safari
  | 'android' //          Chrome's own install prompt, or ⋮ → Install app
  | 'desktop'; //         not a phone — say nothing

export interface InstallSignals {
  userAgent: string;
  /** navigator.platform — iPadOS reports "MacIntel". */
  platform?: string;
  maxTouchPoints?: number;
  /** display-mode: standalone, or Safari's navigator.standalone. */
  standalone: boolean;
}

/*
  In-app browsers that cannot add to the home screen. A link texted to a
  client opens in Messages' own Safari, which is fine; a link tapped from an
  Instagram DM or a Facebook post opens in that app's web view, which has no
  Share → Add to Home Screen at all.
*/
const IN_APP = /\b(Instagram|FBAN|FBAV|FB_IAB|Messenger|Snapchat|TikTok|musical_ly|LinkedInApp|Line\/|GSA\/)/i;

export function isIosDevice(s: Pick<InstallSignals, 'userAgent' | 'platform' | 'maxTouchPoints'>) {
  return (
    /iPad|iPhone|iPod/.test(s.userAgent) ||
    // iPadOS 13+ claims to be a Mac; a Mac has no touch screen.
    (s.platform === 'MacIntel' && (s.maxTouchPoints ?? 0) > 1)
  );
}

export function installPlatform(s: InstallSignals): InstallPlatform {
  if (s.standalone) return 'installed';

  if (isIosDevice(s)) {
    if (IN_APP.test(s.userAgent)) return 'ios-in-app';
    // Every iOS browser carries "Safari" in its UA; the others add their own
    // token (CriOS = Chrome, FxiOS = Firefox, EdgiOS = Edge, OPiOS = Opera).
    if (/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|YaBrowser/.test(s.userAgent)) return 'ios-other';
    return 'ios-safari';
  }

  if (/Android/i.test(s.userAgent)) return 'android';

  return 'desktop';
}

/** Whether the guide should appear on its own, rather than only on request. */
export function shouldPrompt(platform: InstallPlatform) {
  return platform !== 'installed' && platform !== 'desktop';
}

/*
  "Later" means later, not never. Somebody who taps it on the sign-up screen
  is busy, not uninterested, and the cost of never asking again is every
  notification their coach sends them going nowhere.
*/
export const SNOOZE_DAYS = 3;

export function snoozed(dismissedAt: number | null, now: number) {
  if (dismissedAt === null || !Number.isFinite(dismissedAt)) return false;
  return now - dismissedAt < SNOOZE_DAYS * 24 * 60 * 60 * 1000;
}
