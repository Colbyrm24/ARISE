'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { useRef } from 'react';
import { Camera } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { updateAvatar, type AvatarState } from '@/app/(client)/profile/avatar-actions';

/*
  Tap your own face to change it.

  No "choose file" button and no separate upload step: the avatar IS the
  control, the picker opens on tap, and choosing a photo submits. Two taps
  total. A profile picture is not a form worth filling in.
*/

function Overlay() {
  const { pending } = useFormStatus();
  return (
    <span
      className={`absolute inset-0 flex items-center justify-center bg-background/70 transition-opacity ${
        pending ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
      }`}
    >
      <Camera size={16} className="text-accent" />
    </span>
  );
}

export function AvatarUpload({
  src,
  initials,
}: {
  src: string | null;
  initials: string;
}) {
  const [state, action] = useFormState<AvatarState, FormData>(updateAvatar, { ok: true });
  const form = useRef<HTMLFormElement>(null);

  return (
    <form ref={form} action={action} className="flex flex-col gap-1">
      <label className="group relative block h-14 w-14 shrink-0 cursor-pointer">
        <Avatar className="h-14 w-14">
          {src && <AvatarImage src={src} alt="" />}
          <AvatarFallback>{initials}</AvatarFallback>
        </Avatar>
        <Overlay />
        <input
          type="file"
          name="avatar"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          // Picking the photo IS the submit. Requiring a second tap on a
          // button is the step people abandon.
          onChange={() => form.current?.requestSubmit()}
          className="sr-only"
          aria-label="Change profile photo"
        />
      </label>

      {state.error && <p className="text-xs text-destructive">{state.error}</p>}
    </form>
  );
}
