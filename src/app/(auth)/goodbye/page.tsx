import type { Metadata } from 'next';
import Link from 'next/link';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { CONTACT_EMAIL } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Account deleted — ARISE',
  robots: { index: false, follow: false },
};

/*
  Where a deleted account lands.

  Not /login. Somebody who has just pressed "delete my account" and is then
  shown a sign-in form has no way to tell whether it worked — the interface
  looks exactly as it would if the delete had silently failed. This page exists
  to say the one thing they need to hear, which is "yes, it's done."

  In the (auth) group so it gets the wordmark and the lit shell rather than
  arriving as bare text on black, and so the privacy and terms links in that
  layout are still reachable from it.
*/
export default function GoodbyePage() {
  return (
    <SystemWindow title="Done">
      <SystemWindowContent>
        <div className="flex flex-col gap-4">
          <h1 className="text-lg font-semibold">Your account is deleted</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Your logs, photos, measurements and messages have been removed, and
            your sign-in no longer exists. Records of what you paid and any
            agreement you signed are kept, as the privacy policy says.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            If you had an active payment plan, deleting the account did not cancel
            it — email <a className="text-accent hover:underline" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{' '}
            and it will be sorted out.
          </p>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Thanks for training with us. If you ever want to come back, you start
            fresh — there is nothing left to restore.
          </p>
          <Link href="/login" className="readout text-[10px] uppercase text-accent hover:underline">
            Back to sign in
          </Link>
        </div>
      </SystemWindowContent>
    </SystemWindow>
  );
}
