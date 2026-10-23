import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { createAdminClient } from '@/lib/supabase/server';
import { PHOTO_BUCKET } from '@/lib/progress-photos';
import { MEAL_PHOTO_BUCKET } from '@/lib/meal-photos';
import { VOICE_NOTE_BUCKET } from '@/lib/voice-notes';
import { AVATAR_BUCKET } from '@/lib/avatars';

/*
  Deleting a client's account.

  Apple requires an app that creates accounts to let a person delete theirs
  from inside the app, and a privacy policy that promises deletion has to be
  backed by something that actually deletes. This is that.

  The shape of it is the part worth reading, because "delete the user row" is
  wrong in two different directions at once:

  1. It CANNOT cascade. Most of the schema points at Client with no onDelete
     rule, so deleting the row raises a foreign-key error and nothing happens
     — including, importantly, nothing of the deleting. The tables have to be
     emptied by hand, children before parents.

  2. It MUST NOT take the billing history with it. Payments, subscriptions,
     payment links and signed agreements are financial and contractual records
     with their own retention rules, and the schema says so out loud on
     Subscription: "soft delete only — never hard-delete billing records."
     A client who deletes their account has not thereby erased the fact that
     they were charged $250 last March.

  So this erases the person and keeps the ledger. Everything they logged, wrote,
  photographed or were sent is deleted outright. What remains is a stub User and
  Client row holding no personal data — no email, no name, no phone, no photo —
  whose only remaining job is to be the row their invoices hang off. They cannot
  sign in, because the sign-in identity is deleted at Supabase separately.

  Order matters throughout, and the sequence below is not alphabetical or
  arbitrary: each deleteMany runs after anything that points at what it removes.
*/

/** Where a deletion got to, for the audit log and for telling the person the truth. */
export type DeletionReport = {
  /** Rows removed from Postgres. */
  rows: number;
  /** Files removed from storage. */
  files: number;
  /**
   * Buckets that refused a delete.
   *
   * Non-fatal on purpose. A storage error must not abort the database side —
   * a half-deleted account where the rows survive is far worse than one where
   * a photo file lingers, because the rows are what anybody can actually read.
   * Reported so it can be retried rather than silently swallowed.
   */
  storageErrors: string[];
};

/** A per-bucket list of the exact object paths belonging to one person. */
type StoragePlan = Record<string, string[]>;

/**
 * Collects every file that belongs to this person, before their rows are gone.
 *
 * Read first and deleted second, because the rows ARE the index — once
 * progress_photos is empty there is no record of which objects in the bucket
 * were theirs, and the files become unreachable garbage nobody can clean up.
 */
async function collectFiles(userId: string): Promise<StoragePlan> {
  const [photos, meals, attachments] = await Promise.all([
    prisma.progressPhoto.findMany({ where: { clientId: userId }, select: { storagePath: true } }),
    prisma.nutritionLog.findMany({
      where: { clientId: userId, photoPath: { not: null } },
      select: { photoPath: true },
    }),
    /*
      Both sides of the thread.

      An attachment the coach sent to this client lives in the coach's own
      storage prefix but is part of this person's conversation, and it is going
      to be orphaned the moment the messages are deleted. Collecting by message
      rather than by prefix is what catches those.
    */
    prisma.messageAttachment.findMany({
      where: {
        OR: [{ message: { senderId: userId } }, { message: { recipientId: userId } }],
      },
      select: { storagePath: true, type: true },
    }),
  ]);

  const plan: StoragePlan = {
    [PHOTO_BUCKET]: photos.map((p) => p.storagePath),
    [MEAL_PHOTO_BUCKET]: meals.map((m) => m.photoPath!).filter(Boolean),
    /*
      Only voice notes have a bucket. `type` also allows photo and video, which
      nothing in the app writes yet — when something does, it gets a bucket and
      a line here, and until then filtering is more honest than guessing.
    */
    [VOICE_NOTE_BUCKET]: attachments.filter((a) => a.type === 'voice').map((a) => a.storagePath),
  };

  /*
    The avatar is the one file whose path isn't stored anywhere.

    Profile.avatarUrl holds a public URL with a cache-busting query on the end,
    not an object path, and parsing an object path back out of a CDN URL is the
    kind of thing that works until the URL format changes. Listing the person's
    own folder is shorter and cannot go stale. Avatars are flat — one file per
    user, no date folders — so a single non-recursive list is the whole story.
  */
  try {
    const supabase = createAdminClient();
    const { data } = await supabase.storage.from(AVATAR_BUCKET).list(userId);
    plan[AVATAR_BUCKET] = (data ?? []).map((f) => `${userId}/${f.name}`);
  } catch {
    plan[AVATAR_BUCKET] = [];
  }

  return plan;
}

/** Removes the collected files, in batches storage will accept. */
async function removeFiles(plan: StoragePlan): Promise<Pick<DeletionReport, 'files' | 'storageErrors'>> {
  const supabase = createAdminClient();
  let files = 0;
  const storageErrors: string[] = [];

  for (const [bucket, paths] of Object.entries(plan)) {
    if (paths.length === 0) continue;

    // A long-standing client can have hundreds of meal photos, and one
    // oversized remove() call fails as a whole. Chunked so a bad batch costs
    // that batch and not the rest.
    for (let i = 0; i < paths.length; i += 100) {
      const batch = paths.slice(i, i + 100);
      try {
        const { error } = await supabase.storage.from(bucket).remove(batch);
        if (error) storageErrors.push(`${bucket}: ${error.message}`);
        else files += batch.length;
      } catch (e) {
        storageErrors.push(`${bucket}: ${e instanceof Error ? e.message : 'unknown error'}`);
      }
    }
  }

  return { files, storageErrors };
}

/**
 * Erases one client's personal data, keeping only the billing stub.
 *
 * Does not touch Supabase Auth — the caller deletes the sign-in identity, so
 * that this function stays callable from a test and from a coach-side tool
 * without either of them needing to be able to delete logins.
 */
export async function eraseClientData(userId: string): Promise<DeletionReport> {
  const plan = await collectFiles(userId);

  const rows: number = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    let n = 0;
    const count = (r: { count: number }) => {
      n += r.count;
    };

    // --- Logged data. Children of Client, all of it the person's own. -------

    // dailyGoalLog before dailyGoal: the log points at the goal with no
    // cascade, so the other order is a foreign-key error.
    count(await tx.dailyGoalLog.deleteMany({ where: { clientId: userId } }));
    count(await tx.dailyGoal.deleteMany({ where: { clientId: userId } }));

    // workoutLogSet cascades from workoutLog; cardioLog, scheduledItem,
    // coachNote and mealPlan (with its items) all cascade from Client, but are
    // deleted explicitly anyway — relying on a cascade that a later migration
    // quietly drops is how data survives a deletion nobody re-reads.
    count(await tx.workoutLog.deleteMany({ where: { clientId: userId } }));
    count(await tx.clientProgram.deleteMany({ where: { clientId: userId } }));
    count(await tx.cardioLog.deleteMany({ where: { clientId: userId } }));
    count(await tx.scheduledItem.deleteMany({ where: { clientId: userId } }));

    count(await tx.nutritionLog.deleteMany({ where: { clientId: userId } }));
    count(await tx.nutritionTarget.deleteMany({ where: { clientId: userId } }));
    count(await tx.mealPlan.deleteMany({ where: { clientId: userId } }));

    count(await tx.stepLog.deleteMany({ where: { clientId: userId } }));
    count(await tx.weightLog.deleteMany({ where: { clientId: userId } }));
    count(await tx.measurement.deleteMany({ where: { clientId: userId } }));
    count(await tx.progressPhoto.deleteMany({ where: { clientId: userId } }));
    count(await tx.checkIn.deleteMany({ where: { clientId: userId } }));

    /*
      The coach's private notes about this person go too.

      Arguably the coach's own writing rather than the client's data. It is
      still a file of observations about a named individual who has asked to be
      erased, and keeping it would make the promise on the privacy page false.
    */
    count(await tx.coachNote.deleteMany({ where: { clientId: userId } }));
    count(await tx.onboardingResponse.deleteMany({ where: { clientId: userId } }));

    // --- Things hanging off User rather than Client ------------------------

    // attachments cascade from message. Both directions of the thread: a
    // conversation is not deleted by removing half of it.
    count(
      await tx.message.deleteMany({
        where: { OR: [{ senderId: userId }, { recipientId: userId }] },
      })
    );
    // aiMessage cascades from the conversation.
    count(await tx.aiConversation.deleteMany({ where: { userId } }));
    count(await tx.notification.deleteMany({ where: { userId } }));
    count(await tx.pushSubscription.deleteMany({ where: { userId } }));
    count(await tx.healthToken.deleteMany({ where: { clientId: userId } }));
    count(
      await tx.booking.deleteMany({
        where: { OR: [{ clientId: userId }, { coachId: userId }] },
      })
    );
    count(await tx.coachClientRelationship.deleteMany({ where: { clientId: userId } }));

    // The name, phone, photo and time zone.
    count(await tx.profile.deleteMany({ where: { userId } }));

    /*
      The audit log is detached, not deleted.

      "Programme changed on 12 March" is a record of the business operating and
      is worth keeping; "...by Sarah Whitfield" is personal data she has asked
      us to lose. Nulling the actor keeps the first and drops the second, which
      is why actorId was nullable to begin with. metadataJson can name them
      too, so it goes as well.
    */
    await tx.auditLog.updateMany({
      where: { actorId: userId },
      /*
        Prisma.DbNull, not null. For a nullable Json column `null` is ambiguous
        — it can mean the JSON value `null` — so the client rejects it and wants
        one of the two sentinels spelled out. DbNull is the SQL NULL.
      */
      data: { actorId: null, metadataJson: Prisma.DbNull },
    });

    /*
      Invites are the coach's records, but one may carry this person's name.
    */
    await tx.clientInvite.updateMany({ where: { usedBy: userId }, data: { name: null } });

    /*
      --- What deliberately stays -----------------------------------------

      Payment, Subscription, PaymentLink, Agreement and AgreementSignature, and
      the Client and User rows they point at. Kept for tax, accounting and
      contract reasons, and stated plainly on the privacy page rather than done
      quietly.

      The User row is stripped to an id. A tombstone address in the reserved
      .invalid TLD rather than null, because email is non-null and unique: it
      has to be *a* value, and it has to be a different one for each deleted
      account, and it must never be deliverable to anybody.
    */
    /*
      updateMany, not update. A person can be role `client` with no Client row
      yet — somebody who signed up and never got as far as a plan — and
      `update` on a missing row throws, which would roll the whole transaction
      back and leave the account they asked to delete fully intact.
    */
    await tx.client.updateMany({
      where: { userId },
      // birthDate goes too: it is personal data, and the stub keeps none.
      data: { status: 'cancelled', endDate: new Date(), birthDate: null },
    });
    await tx.user.update({
      where: { id: userId },
      data: { email: `deleted-${userId}@arise.invalid` },
    });

    return n;
  });

  const { files, storageErrors } = await removeFiles(plan);

  return { rows, files, storageErrors };
}

/**
 * Deletes the sign-in identity, so the account cannot be used again.
 *
 * Separate from the erase above and run after it. If this ran first and the
 * erase then failed, the person would be left unable to sign in to an account
 * that still held all of their data — locked out of their own deletion.
 *
 * Returns an error string rather than throwing: by the time this runs the data
 * is already gone, and an exception here would show the person a failure over
 * a deletion that actually succeeded.
 */
export async function deleteAuthIdentity(userId: string): Promise<string | null> {
  try {
    const supabase = createAdminClient();
    const { error } = await supabase.auth.admin.deleteUser(userId);
    return error ? error.message : null;
  } catch (e) {
    return e instanceof Error ? e.message : 'Could not delete the sign-in.';
  }
}
