'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { stripe } from '@/lib/stripe';
import { requireCoach } from '@/lib/auth';
import { coachOwnsTemplate } from '@/lib/coach-guard';
import { normalizeSlug, toCents } from '@/lib/membership';
import { refreshMemberCalendars } from '@/lib/program-offer';

/*
  Setting up and running Follow My Split from the console.

  Creating the offer is the one place ARISE creates a price in Stripe rather
  than importing one: a monthly price for exactly the amount typed, on a
  product named after the offer, so nothing has to be set up in the Stripe
  dashboard first. Changing the price later makes a NEW Stripe price for new
  members only — Stripe prices are immutable, and members who joined at one
  price keep paying it.
*/

export type OfferState = { ok: boolean; message: string };

const PATH = '/coach/split';

async function monthlyPrice(title: string, cents: number) {
  const product = await stripe.products.create({
    name: title,
    metadata: { arise: 'follow-my-split' },
  });
  const price = await stripe.prices.create({
    product: product.id,
    currency: 'usd',
    unit_amount: cents,
    recurring: { interval: 'month' },
    metadata: { arise: 'follow-my-split' },
  });
  return { productId: product.id, priceId: price.id };
}

async function memberPlan(title: string, cents: number) {
  const { productId, priceId } = await monthlyPrice(title, cents);
  return prisma.plan.create({
    data: {
      name: title,
      price: cents / 100,
      stripePriceId: priceId,
      stripeProductId: productId,
      billingType: 'subscription',
      paymentFrequency: 'monthly',
      numberOfPayments: null,
      termMonths: 1,
      defaultProvider: 'stripe',
    },
  });
}

async function hasWeek(templateId: string) {
  return (await prisma.programDay.count({ where: { templateId } })) > 0;
}

export async function createOffer(_prev: OfferState, formData: FormData): Promise<OfferState> {
  const coach = await requireCoach();

  const title = String(formData.get('title') ?? '').trim().slice(0, 80);
  const slug = normalizeSlug(String(formData.get('slug') ?? ''));
  const templateId = String(formData.get('templateId') ?? '');
  const pitch = String(formData.get('pitch') ?? '').trim().slice(0, 400) || null;
  const cents = toCents(String(formData.get('price') ?? ''));

  if (!title) return { ok: false, message: 'Give it a name.' };
  if (!slug) return { ok: false, message: 'The page address needs 2–40 letters, numbers or dashes.' };
  if (!cents) return { ok: false, message: 'Enter a monthly price, like 16.99.' };
  if (!(await coachOwnsTemplate(coach.id, templateId))) {
    return { ok: false, message: 'Pick one of your programs.' };
  }
  if (!(await hasWeek(templateId))) {
    return {
      ok: false,
      message: "That program's week is empty — open it and set what each day is first.",
    };
  }
  if (await prisma.programOffer.findUnique({ where: { slug }, select: { id: true } })) {
    return { ok: false, message: 'That page address is taken — try another.' };
  }

  let planId: string;
  try {
    planId = (await memberPlan(title, cents)).id;
  } catch (err) {
    console.error('Could not create the Follow My Split price', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: 'Stripe would not create the price. Try again in a minute.' };
  }

  await prisma.programOffer.create({
    data: { coachId: coach.id, slug, title, pitch, templateId, planId },
  });

  revalidatePath(PATH);
  return { ok: true, message: 'Live. Your page is ready to share.' };
}

async function ownedOffer(coachId: string, offerId: string) {
  const offer = await prisma.programOffer.findUnique({ where: { id: offerId } });
  return offer && offer.coachId === coachId ? offer : null;
}

export async function updateOffer(_prev: OfferState, formData: FormData): Promise<OfferState> {
  const coach = await requireCoach();
  const offer = await ownedOffer(coach.id, String(formData.get('offerId') ?? ''));
  if (!offer) return { ok: false, message: 'That offer is not yours.' };

  const title = String(formData.get('title') ?? '').trim().slice(0, 80);
  const pitch = String(formData.get('pitch') ?? '').trim().slice(0, 400) || null;
  const templateId = String(formData.get('templateId') ?? '');
  if (!title) return { ok: false, message: 'Give it a name.' };
  if (!(await coachOwnsTemplate(coach.id, templateId))) {
    return { ok: false, message: 'Pick one of your programs.' };
  }
  if (!(await hasWeek(templateId))) {
    return { ok: false, message: "That program's week is empty." };
  }

  await prisma.programOffer.update({
    where: { id: offer.id },
    data: { title, pitch, templateId },
  });

  // A new program only reaches members' calendars when he says so — see
  // refreshCalendars — so swapping it here can't silently rewrite hundreds of
  // people's weeks.
  revalidatePath(PATH);
  revalidatePath(`/follow/${offer.slug}`);
  return {
    ok: true,
    message:
      templateId !== offer.templateId
        ? 'Saved. New members get the new program — press "Update everyone\'s calendar" to move current members onto it.'
        : 'Saved.',
  };
}

export async function changeOfferPrice(_prev: OfferState, formData: FormData): Promise<OfferState> {
  const coach = await requireCoach();
  const offer = await ownedOffer(coach.id, String(formData.get('offerId') ?? ''));
  if (!offer) return { ok: false, message: 'That offer is not yours.' };

  const cents = toCents(String(formData.get('price') ?? ''));
  if (!cents) return { ok: false, message: 'Enter a monthly price, like 14.99.' };

  try {
    const plan = await memberPlan(offer.title, cents);
    await prisma.programOffer.update({ where: { id: offer.id }, data: { planId: plan.id } });
  } catch (err) {
    console.error('Could not change the Follow My Split price', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { ok: false, message: 'Stripe would not create the new price. Try again in a minute.' };
  }

  revalidatePath(PATH);
  revalidatePath(`/follow/${offer.slug}`);
  return {
    ok: true,
    message: `New members now pay $${(cents / 100).toFixed(2)}/month. Current members keep the price they joined at.`,
  };
}

export async function setOfferOpen(formData: FormData) {
  const coach = await requireCoach();
  const offer = await ownedOffer(coach.id, String(formData.get('offerId') ?? ''));
  if (!offer) return;
  await prisma.programOffer.update({
    where: { id: offer.id },
    data: { active: formData.get('open') === 'true' },
  });
  revalidatePath(PATH);
  revalidatePath(`/follow/${offer.slug}`);
}

export async function refreshCalendars(_prev: OfferState, formData: FormData): Promise<OfferState> {
  const coach = await requireCoach();
  const offer = await ownedOffer(coach.id, String(formData.get('offerId') ?? ''));
  if (!offer) return { ok: false, message: 'That offer is not yours.' };

  try {
    const n = await refreshMemberCalendars(offer.id);
    revalidatePath(PATH);
    return {
      ok: true,
      message: `Updated ${n} member${n === 1 ? '' : 's'} from today. Finished sessions were left alone.`,
    };
  } catch (err) {
    console.error('Could not refresh member calendars', {
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      ok: false,
      message: 'Stopped partway — press it again and it carries on from where it got to.',
    };
  }
}
