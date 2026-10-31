import { NextResponse } from 'next/server';
import { applicationSchema } from '@/lib/application-schema';

/*
  The public end of the /coaching/apply form. No account, no session.

  The database is reached through a dynamic import so nothing on the public
  pages pulls Prisma in when they are built or rendered — the landing page
  must render even where the database client can't load.
*/

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const parsed = applicationSchema.safeParse(body ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Some answers need another look.', fields: Object.keys(parsed.error.flatten().fieldErrors) },
      { status: 400 }
    );
  }

  try {
    const { saveApplication } = await import('@/lib/coaching-applications');
    await saveApplication(parsed.data);
    // Same answer for saved, duplicate and bot — see saveApplication.
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('coaching application failed to save', {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "That didn't go through. Try again in a minute." },
      { status: 500 }
    );
  }
}
