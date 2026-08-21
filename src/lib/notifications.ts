import { prisma } from '@/lib/prisma';
import { sendPush } from '@/lib/push';

export const NOTIFICATION_TYPES = ['message', 'check_in', 'progress_photo'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/**
 * Where clicking a notification should take you. Coach and client see the
 * same event from opposite sides, so the link depends on who is reading.
 */
export function notificationHref(
  type: string,
  role: 'coach' | 'client',
  clientId?: string | null
) {
  if (role === 'client') return type === 'message' ? '/messages' : '/progress';
  if (!clientId) return '/coach/inbox';

  switch (type) {
    case 'message':
      return `/coach/inbox/${clientId}`;
    case 'check_in':
    case 'progress_photo':
      return `/coach/clients/${clientId}`;
    default:
      return '/coach/inbox';
  }
}

/**
 * Notifications are a side effect, never the point of the request. If writing
 * one fails, the check-in or message it was announcing has already been saved
 * and the user should not see an error — so every failure is swallowed here
 * rather than bubbling into the action.
 */
const PUSH_TITLES: Record<NotificationType, string> = {
  message: 'New message',
  check_in: 'Check-in submitted',
  progress_photo: 'New progress photo',
};

export async function notify(
  userId: string,
  type: NotificationType,
  body: string,
  meta?: { clientId?: string }
) {
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        // The client id rides along in the body so the coach's list can link
        // straight to the right person without another schema column.
        body: meta?.clientId ? `${meta.clientId}|${body}` : body,
      },
    });
  } catch {
    // Intentionally silent — see the note above.
  }

  // Push is deliberately after the row is written and separately guarded: the
  // in-app notification is the source of truth, the push is a nudge toward it.
  // Losing the nudge is survivable; losing the record is not.
  try {
    const recipient = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true },
    });
    if (!recipient) return;

    const role = recipient.role === 'client' ? 'client' : 'coach';
    await sendPush(userId, {
      title: PUSH_TITLES[type] ?? 'ARISE',
      body: body.slice(0, 160),
      url: notificationHref(type, role, meta?.clientId ?? null),
      // One tag per type, so three messages while the phone is in a pocket
      // collapse into one line instead of three.
      tag: type,
    });
  } catch {
    // Same contract as above — never let a nudge break the thing it announces.
  }
}

/** Splits the stored body back into its client id and human-readable text. */
export function parseBody(body: string): { clientId: string | null; text: string } {
  const i = body.indexOf('|');
  if (i === -1) return { clientId: null, text: body };
  return { clientId: body.slice(0, i), text: body.slice(i + 1) };
}

/** The coach currently assigned to a client, or null if they have none. */
export async function coachIdForClient(clientId: string) {
  try {
    const rel = await prisma.coachClientRelationship.findFirst({
      where: { clientId, status: 'active' },
      orderBy: { assignedAt: 'desc' },
    });
    return rel?.coachId ?? null;
  } catch {
    return null;
  }
}

/** Convenience wrapper: announce a client's action to whoever coaches them. */
export async function notifyCoach(clientId: string, type: NotificationType, body: string) {
  const coachId = await coachIdForClient(clientId);
  if (!coachId) return;
  await notify(coachId, type, body, { clientId });
}

export async function displayName(userId: string) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
    });
    return user?.profile?.fullName ?? user?.email ?? 'A client';
  } catch {
    return 'A client';
  }
}
