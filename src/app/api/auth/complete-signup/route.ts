import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { prisma } from '@/lib/prisma';

/**
 * Called right after Supabase creates the auth user. Mirrors that user
 * into our own `users` table (and creates their `profile` + `clients`
 * row) so the rest of ARISE — which is all built on our own database,
 * not on Supabase's auth table directly — has something to join against.
 *
 * This route trusts nothing from the request body except the display
 * name. The email and user id always come from the verified session,
 * never from anything the browser could tamper with.
 */
export async function POST(request: Request) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const fullName: string | undefined = typeof body.fullName === 'string' ? body.fullName : undefined;

  const dbUser = await prisma.user.upsert({
    where: { id: user.id },
    update: {},
    create: {
      id: user.id,
      email: user.email!,
      role: 'client',
      profile: { create: { fullName } },
      clientRecord: { create: { status: 'lead' } },
    },
  });

  return NextResponse.json({ id: dbUser.id });
}
