'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';
import { BACKGROUNDS, DEFAULT_BACKGROUND, type BackgroundId } from '@/lib/backgrounds';

const IDS = new Set<string>(BACKGROUNDS.map((b) => b.id));

/**
 * Sets the signed-in person's background.
 *
 * Their OWN profile, from the session, with no user id on the form — as with
 * the avatar action, there is no version of this that takes one, so there is
 * nothing to point at somebody else.
 *
 * The value is checked against the known list rather than written through.
 * It lands in a `data-bg` attribute, and although React escapes it, storing
 * arbitrary text would mean a row that renders as an unstyled page forever
 * with no way for the client to tell why.
 */
export async function setBackground(formData: FormData) {
  const user = await requireClient();

  const raw = formData.get('background');
  const background: BackgroundId =
    typeof raw === 'string' && IDS.has(raw) ? (raw as BackgroundId) : DEFAULT_BACKGROUND;

  /*
    Upsert, not update.

    A profile row is created at signup, but not every account has one — the
    seeded and hand-made ones in this database do not all carry a profile, and
    an update against a missing row throws rather than doing nothing. Picking
    a colour should not be able to 500 somebody's settings screen.
  */
  await prisma.profile.upsert({
    where: { userId: user.id },
    update: { background },
    create: { userId: user.id, background },
  });

  // The layout reads it, so every client screen has to be rebuilt — the theme
  // is not scoped to the settings page it was chosen on.
  revalidatePath('/', 'layout');
}
