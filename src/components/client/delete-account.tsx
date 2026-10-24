'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { deleteMyAccount, deletionPreview } from '@/app/(client)/profile/delete-actions';

/*
  Account deletion, as a panel rather than a modal.

  ARISE has no dialog primitive, and this is not the feature to introduce one
  for: a modal on a phone covers the counts it is asking the person to read, and
  a full-screen sheet over the profile is a lot of ceremony for something most
  people will open once by accident. An inline panel that has to be opened, read
  and typed into is harder to trip over than either.

  Collapsed, it is one quiet line. It is deliberately the least prominent thing
  on the profile — below the sign-out button, in muted ink, no destructive red
  until it is actually open — because a red DELETE ACCOUNT button sitting under
  somebody's progress photos is its own kind of bad design.

  The counts load when it opens, not on page load. Four COUNT queries to render
  a line nobody asked for is a tax on every profile view.
*/

type Preview = Awaited<ReturnType<typeof deletionPreview>>;

export function DeleteAccount({ email }: { email: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  async function expand() {
    setOpen(true);
    setError(null);
    try {
      setPreview(await deletionPreview());
    } catch {
      /*
        The panel still works without counts. They make the warning concrete,
        but a failed count must not stand between somebody and deleting their
        own data — that is the one request an app has no business making harder.
      */
      setPreview(null);
    }
  }

  async function confirm() {
    setWorking(true);
    setError(null);
    const result = await deleteMyAccount(typed);
    if (!result.ok) {
      setError(result.error);
      setWorking(false);
      return;
    }
    /*
      Straight to a page that says what happened, and refresh so the dead
      session cookie is dropped rather than carried into the next request.
      Not /login: landing on a sign-in form after deleting your account reads
      like the deletion failed.
    */
    router.replace('/goodbye');
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={expand}
        className="readout self-center text-[10px] uppercase text-muted-foreground underline underline-offset-4 transition-colors hover:text-destructive"
      >
        Delete account
      </button>
    );
  }

  const matches = typed.trim().toLowerCase() === email.toLowerCase();

  return (
    <div className="flex flex-col gap-4 rounded border border-destructive/40 bg-destructive/[0.06] p-5">
      <div className="flex items-center gap-2">
        <AlertTriangle size={15} className="text-destructive" />
        <h2 className="text-sm font-semibold">Delete your account</h2>
      </div>

      <p className="text-sm leading-relaxed text-muted-foreground">
        This deletes your logs, photos, measurements and messages for good. It
        cannot be undone, and your coach cannot get any of it back.
      </p>

      {preview && (
        <ul className="readout flex flex-col gap-1 text-[10px] uppercase text-muted-foreground">
          <li>{preview.meals} meals logged</li>
          <li>{preview.workouts} workouts logged</li>
          <li>{preview.weights} weigh-ins</li>
          <li>{preview.photos} progress photos</li>
        </ul>
      )}

      {preview?.hasActiveSubscription && preview.isMember && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          Deleting your account also cancels your subscription straight away — you won&apos;t be
          charged again.
        </p>
      )}

      {preview?.hasActiveSubscription && !preview.isMember && (
        <p className="text-sm leading-relaxed text-destructive">
          You have an active payment plan.{' '}
          <strong className="font-semibold">
            Deleting your account does not cancel it and does not stop the charges.
          </strong>{' '}
          Message your coach to end coaching first, then come back and do this.
        </p>
      )}

      <p className="text-sm leading-relaxed text-muted-foreground">
        Records of what you paid, and any agreement you signed, are kept — we have
        to keep those. Everything else goes.
      </p>

      <div className="flex flex-col gap-2">
        <Label htmlFor="delete-confirm">Type {email} to confirm</Label>
        <Input
          id="delete-confirm"
          type="email"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={email}
        />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button
          type="button"
          variant="destructive"
          disabled={!matches || working}
          onClick={confirm}
        >
          {working ? 'Deleting…' : 'Delete my account'}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={working}
          onClick={() => {
            setOpen(false);
            setTyped('');
            setError(null);
          }}
        >
          Keep my account
        </Button>
      </div>
    </div>
  );
}
