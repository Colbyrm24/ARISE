/*
  Which home-screen instructions a phone gets.

  The cases that matter are the ones that would send somebody the wrong taps:
  an iPad pretending to be a Mac, Chrome on an iPhone (whose Share button is in
  a different place), and an Instagram link, which cannot be installed at all.
*/
import test from 'node:test';
import assert from 'node:assert/strict';
import { installPlatform, shouldPrompt, snoozed, SNOOZE_DAYS } from '@/lib/install-platform';

const IPHONE_SAFARI =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1';
const IPHONE_CHROME =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/130.0.6723.90 Mobile/15E148 Safari/604.1';
const IPHONE_INSTAGRAM =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 354.0.0.29.90 (iPhone15,3; iOS 18_1; en_US)';
const IPAD_AS_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const MAC_CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

test('an iPhone in Safari gets the Share → Add to Home Screen steps', () => {
  assert.equal(installPlatform({ userAgent: IPHONE_SAFARI, standalone: false }), 'ios-safari');
});

test('Chrome on an iPhone is told where its own Share button is', () => {
  assert.equal(installPlatform({ userAgent: IPHONE_CHROME, standalone: false }), 'ios-other');
});

test('an Instagram link is told to open in Safari, because it cannot install', () => {
  assert.equal(installPlatform({ userAgent: IPHONE_INSTAGRAM, standalone: false }), 'ios-in-app');
});

test('an iPad that reports itself as a Mac is still treated as iOS', () => {
  assert.equal(
    installPlatform({ userAgent: IPAD_AS_MAC, platform: 'MacIntel', maxTouchPoints: 5, standalone: false }),
    'ios-safari'
  );
});

test('a real Mac is not asked to install anything', () => {
  const p = installPlatform({ userAgent: MAC_CHROME, platform: 'MacIntel', maxTouchPoints: 0, standalone: false });
  assert.equal(p, 'desktop');
  assert.equal(shouldPrompt(p), false);
});

test('Android gets the install prompt', () => {
  assert.equal(installPlatform({ userAgent: ANDROID_CHROME, standalone: false }), 'android');
});

test('already on the home screen means nothing is shown', () => {
  const p = installPlatform({ userAgent: IPHONE_SAFARI, standalone: true });
  assert.equal(p, 'installed');
  assert.equal(shouldPrompt(p), false);
});

test('"Later" comes back after the snooze, not never', () => {
  const day = 24 * 60 * 60 * 1000;
  const now = Date.UTC(2026, 9, 18);
  assert.equal(snoozed(null, now), false);
  assert.equal(snoozed(now - day, now), true);
  assert.equal(snoozed(now - (SNOOZE_DAYS + 0.01) * day, now), false);
  assert.equal(snoozed(Number.NaN, now), false);
});
