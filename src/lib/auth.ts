import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * The real, server-side identity check. Every page that shows private data
 * should call one of the functions below rather than trusting anything
 * passed from the browser (a prop, a query param, a cookie value read
 * directly) — this is what actually stops a client from ever seeing
 * another client's data.
 */

export async function getCurrentUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: { profile: true, clientRecord: true },
  });

  return dbUser;
}

/** Use at the top of any client-only page/layout. Redirects if not a client. */
export async function requireClient() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'client') {
    redirect('/login');
  }
  return user;
}

/** Use at the top of any coach-only page/layout. Redirects if not a coach/admin. */
export async function requireCoach() {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'coach' && user.role !== 'admin')) {
    redirect('/login');
  }
  return user;
}
