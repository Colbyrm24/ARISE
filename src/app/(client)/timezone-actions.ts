'use server';

import { prisma } from '@/lib/prisma';
import { requireClient } from '@/lib/auth';

/*
  Where the client actually is.

  `Profile.timezone` defaults to "America/New_York" and, until this existed,
  nothing in the product ever wrote it for a client. The only timezone control
  in the whole app is on /coach/schedule, and that one sets the COACH's zone.

  So every client was Eastern. Every `@db.Date` column in the app — meals,
  steps, habits, weigh-ins, cardio, goal logs — is stamped with
  `todayFor(user)`, which is that default, and read back the same way. Which
  means the write and the read agreed with each other and disagreed with the
  client:

    - a client in Los Angeles logging dinner at 9:30pm sees it stamped 12:30am
      Eastern, i.e. TOMORROW. It vanishes off their Today screen and out of the
      day's totals the moment they save it.
    - a client in Zimbabwe logging anything before 7am gets it stamped
      YESTERDAY, for the same reason in the other direction.

  A client reported exactly this: "I logged more meals than just the protein
  waffles" — breakfast landed on the right day, everything after the evening
  cutoff landed on the next one. It reads as the app losing data. It isn't
  losing anything; it is filing it under a day the client can't see.

  Detected rather than asked. `Intl.DateTimeFormat().resolvedOptions().timeZone`
  is right for essentially everybody and costs the client nothing, where a
  dropdown on a settings screen is a thing most people would never open — and
  a timezone nobody sets is the bug we already have.
*/
export async function saveClientTimezone(timezone: string) {
  const user = await requireClient();

  /*
    Validated here, not trusted. This arrives from the browser, so it is user
    input on a public endpoint: a bad string written to the column would throw
    inside Intl on every render of every screen that formats a date, which is
    a far worse failure than ignoring it. Intl itself is the validator —
    there is no list of zones worth hardcoding and keeping current.
  */
  const tz = timezone.trim();
  if (!tz || tz.length > 64) return;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    return;
  }

  // Only when it actually changed. This runs on every client page load, and
  // an unconditional write would be one pointless UPDATE per navigation on
  // the busiest routes in the app.
  if (user.profile?.timezone === tz) return;

  /*
    upsert rather than update: a profile row is created alongside the user in
    every path that makes one, but an account that predates that — or one
    repaired by repairMissingUserRow — can reach a client screen without one,
    and a plain update would throw on the missing row.
  */
  await prisma.profile.upsert({
    where: { userId: user.id },
    create: { userId: user.id, timezone: tz },
    update: { timezone: tz },
  });
}
