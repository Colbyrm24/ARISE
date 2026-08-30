import { NextResponse } from 'next/server';
import { stripe } from '@/lib/stripe';
import { prisma } from '@/lib/prisma';
import { createClient } from '@/lib/supabase/server';
import { getSiteUrl } from '@/lib/site-url';

/*
  The way out of a declining card.

  Until now there wasn't one. No Stripe Customer was ever stored, so there
  was nothing to open a portal onto — a card that started failing was
  surfaced to the coach and to nobody else, and the only fix was him asking
  the client to sort it out somewhere ARISE could not send them.

  Stripe hosts the portal, which is the whole point: updating a card means
  handling card details, and the right number of places for those to exist is
  one, at Stripe. ARISE never sees them.

  A POST rather than a link because it creates a session at Stripe, and a
  GET that has side effects gets fired by every link prefetcher and preview
  fetcher that touches the page.
*/
export async function POST() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  }

  /*
    The customer is read from the signed-in session's own row and never from
    the request. A customer id passed in by the browser would let anyone open
    a portal onto anyone else's payment methods and invoice history, which is
    about the worst thing this route could be talked into doing.
  */
  const client = await prisma.client.findUnique({
    where: { userId: user.id },
    select: { stripeCustomerId: true },
  });

  if (!client?.stripeCustomerId) {
    /*
      Nobody who paid before this shipped has an id yet — it is captured at
      checkout, so it arrives on their next payment. Said plainly rather than
      as an error, because from where they are standing nothing is broken.
    */
    return NextResponse.json(
      { error: 'There is no billing account to open yet. Message your coach and they can sort it.' },
      { status: 409 }
    );
  }

  try {
    const session = await stripe.billingPortal.sessions.create({
      customer: client.stripeCustomerId,
      return_url: `${getSiteUrl()}/profile`,
    });
    return NextResponse.json({ url: session.url });
  } catch (err) {
    console.error('Could not open the billing portal', {
      clientId: user.id,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: 'Stripe would not open the billing page. Try again in a minute.' },
      { status: 502 }
    );
  }
}
