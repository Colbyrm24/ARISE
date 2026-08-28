import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BILLING_TYPE_LABELS, PAYMENT_FREQUENCY_LABELS, PROVIDER_LABELS } from '@/lib/plans';
import { listStripePrices, type ClassifiedStripePrice } from '@/lib/stripe-prices';
import {
  createPlan,
  togglePlanActive,
  createAgreementTemplate,
  updateAgreementTemplate,
  setDefaultAgreementTemplate,
} from './actions';
import { importStripePrice, syncStripePrices, updatePlanTerm } from './stripe-actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const textareaClass =
  'w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const LINK_STATUS_LABELS: Record<string, string> = {
  pending: 'Awaiting payment',
  paid: 'Paid',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

/*
  Reading Stripe is a network call on a page that must still render when the
  key is missing, the account is new, or Stripe is having a bad morning. A
  failure here costs the coach the import card, not the whole screen.
*/
async function readStripePrices(): Promise<{ prices: ClassifiedStripePrice[]; error: string | null }> {
  if (!process.env.STRIPE_SECRET_KEY) {
    return { prices: [], error: 'STRIPE_SECRET_KEY is not set on this deployment yet.' };
  }
  try {
    return { prices: await listStripePrices(), error: null };
  } catch (err) {
    console.error('Could not list Stripe prices', {
      error: err instanceof Error ? err.message : String(err),
    });
    return { prices: [], error: 'Stripe did not answer. Check the API key and try again.' };
  }
}

export default async function CoachPaymentsPage() {
  const [plans, templates, recentLinks] = await Promise.all([
    prisma.plan.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.agreementTemplate.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.paymentLink.findMany({
      include: { client: { include: { user: { include: { profile: true } } } }, plan: true },
      orderBy: { createdAt: 'desc' },
      take: 10,
    }),
  ]);

  const { prices: stripePrices, error: stripeError } = await readStripePrices();
  const importedPriceIds = new Set(plans.map((p) => p.stripePriceId).filter(Boolean) as string[]);

  return (
    <div className="flex flex-col gap-8">
      <header>
        <h1 className="text-2xl font-semibold">Payments</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Coaching plans, agreement templates, and payment link activity — everything that turns a
          lead into a signed, paying client.
        </p>
      </header>

      {/* Recent payment links */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Payment Links</CardTitle>
        </CardHeader>
        <CardContent>
          {recentLinks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No payment links yet — generate one from a client&apos;s profile.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {recentLinks.map((link) => {
                const name = link.client.user.profile?.fullName ?? link.client.user.email;
                return (
                  <Link
                    key={link.id}
                    href={`/coach/clients/${link.clientId}`}
                    className="-mx-2 flex items-center justify-between gap-3 rounded-xl px-2 py-2.5 transition-colors hover:bg-secondary/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {link.plan.name} · {PROVIDER_LABELS[link.provider]}
                      </p>
                    </div>
                    <Badge variant={link.status === 'paid' ? 'success' : 'outline'}>
                      {LINK_STATUS_LABELS[link.status] ?? link.status}
                    </Badge>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Your Stripe prices */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <CardTitle>Prices in Stripe</CardTitle>
          <form action={syncStripePrices}>
            <Button type="submit" size="sm" variant="secondary">
              Sync from Stripe
            </Button>
          </form>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm text-muted-foreground">
            Every active price in your Stripe account. Import one and it becomes a plan you can
            pick for any client — the checkout then charges that exact Stripe price, so the amount
            never has to be re-typed here and can never drift from what you actually charge.
          </p>

          {stripeError ? (
            <p className="text-sm text-destructive">{stripeError}</p>
          ) : stripePrices.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No active prices in Stripe yet. Create one in the Stripe dashboard, then press Sync.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {stripePrices.map((price) => {
                const imported = price.supported && importedPriceIds.has(price.id);
                return (
                  <div
                    key={price.id}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{price.name}</p>
                      {price.supported ? (
                        <p className="truncate text-xs text-muted-foreground">
                          $
                          {price.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                          {price.paymentFrequency
                            ? ` ${PAYMENT_FREQUENCY_LABELS[price.paymentFrequency]}`
                            : ' one time'}{' '}
                          · {price.id}
                        </p>
                      ) : (
                        <p className="truncate text-xs text-muted-foreground">{price.reason}</p>
                      )}
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {!price.supported ? (
                        <Badge variant="outline">Not importable</Badge>
                      ) : imported ? (
                        <Badge variant="success">Imported</Badge>
                      ) : (
                        <form action={importStripePrice} className="flex items-center gap-2">
                          <input type="hidden" name="priceId" value={price.id} />
                          <Input
                            name="termMonths"
                            type="number"
                            min="1"
                            defaultValue={12}
                            className="h-9 w-24"
                            aria-label="Agreement length in months"
                          />
                          <Button type="submit" size="sm">
                            Import
                          </Button>
                        </form>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Plans */}
      <Card>
        <CardHeader>
          <CardTitle>Coaching Plans</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {plans.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No plans yet — create your first coaching offer below.
            </p>
          ) : (
            <div className="flex flex-col gap-2">
              {plans.map((plan) => (
                <div
                  key={plan.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border bg-secondary/20 px-4 py-3"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{plan.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      ${Number(plan.price).toLocaleString('en-US', { minimumFractionDigits: 2 })} ·{' '}
                      {BILLING_TYPE_LABELS[plan.billingType]} · {plan.termMonths} mo ·{' '}
                      {PROVIDER_LABELS[plan.defaultProvider]}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {plan.stripePriceId && (
                      <form action={updatePlanTerm} className="flex items-center gap-1.5">
                        <input type="hidden" name="planId" value={plan.id} />
                        <Input
                          name="termMonths"
                          type="number"
                          min="1"
                          defaultValue={plan.termMonths}
                          className="h-9 w-20"
                          aria-label={`Agreement length for ${plan.name}, in months`}
                        />
                        <Button type="submit" variant="ghost" size="sm">
                          Save mo
                        </Button>
                      </form>
                    )}
                    {plan.stripePriceId && <Badge variant="outline">Stripe price</Badge>}
                    <Badge variant={plan.active ? 'success' : 'outline'}>
                      {plan.active ? 'Active' : 'Archived'}
                    </Badge>
                    <form action={togglePlanActive}>
                      <input type="hidden" name="planId" value={plan.id} />
                      <input type="hidden" name="active" value={String(plan.active)} />
                      <Button type="submit" variant="ghost" size="sm">
                        {plan.active ? 'Archive' : 'Restore'}
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}

          <form action={createPlan} className="flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-sm font-medium">New plan</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Input name="name" placeholder="Plan name (e.g. 6-Month Transformation)" required />
              <Input name="price" type="number" step="0.01" min="0" placeholder="Price per payment ($)" required />
              <select name="billingType" className={selectClass} required defaultValue="payment_plan">
                <option value="one_time">One-time payment</option>
                <option value="payment_plan">Fixed payment plan</option>
                <option value="subscription">Ongoing subscription</option>
              </select>
              <select name="paymentFrequency" className={selectClass} defaultValue="monthly">
                <option value="monthly">Monthly</option>
                <option value="biweekly">Every two weeks</option>
                <option value="weekly">Weekly</option>
                <option value="one_time">One time</option>
              </select>
              <Input
                name="numberOfPayments"
                type="number"
                min="1"
                placeholder="Number of payments (payment plans only)"
              />
              <Input name="termMonths" type="number" min="1" placeholder="Agreement duration (months)" required />
              <select name="defaultProvider" className={selectClass} required defaultValue="stripe">
                <option value="stripe">Stripe</option>
                <option value="fanbasis">FanBasis</option>
              </select>
            </div>
            <Button type="submit" size="sm" className="w-fit">
              Create Plan
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Agreement templates */}
      <Card>
        <CardHeader>
          <CardTitle>Agreement Templates</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <p className="text-xs text-muted-foreground">
            Use {'{{client_name}}'}, {'{{coach_name}}'}, {'{{price}}'}, {'{{payment_structure}}'},{' '}
            {'{{start_date}}'}, {'{{term_months}}'}, and {'{{signed_date}}'} anywhere in the body —
            ARISE fills them in automatically the moment a client pays.
          </p>

          {/*
            The header sits OUTSIDE the edit form on purpose. "Make default"
            used to be its own <form> nested inside the edit <form>, which HTML
            forbids — the parser drops the inner one, so the button became a
            submit for the outer form and just re-saved the body. Making a
            template default was impossible from this screen, which then meant
            the template select on every client page had no default to pick.
          */}
          {templates.map((template) => (
            <div
              key={template.id}
              className="flex flex-col gap-3 border border-border bg-secondary/20 p-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-medium">
                  {template.name}{' '}
                  <span className="text-xs font-normal text-muted-foreground">v{template.version}</span>
                </p>
                {template.isDefault ? (
                  <Badge variant="accent">Default</Badge>
                ) : (
                  <form action={setDefaultAgreementTemplate}>
                    <input type="hidden" name="templateId" value={template.id} />
                    <Button type="submit" variant="ghost" size="sm">
                      Make default
                    </Button>
                  </form>
                )}
              </div>

              <form action={updateAgreementTemplate} className="flex flex-col gap-3">
                <input type="hidden" name="templateId" value={template.id} />
                <textarea name="body" rows={10} defaultValue={template.body} className={textareaClass} />
                <Button type="submit" size="sm" className="w-fit">
                  Save changes
                </Button>
              </form>
            </div>
          ))}

          <form action={createAgreementTemplate} className="flex flex-col gap-3 border-t border-border pt-5">
            <p className="text-sm font-medium">New template</p>
            <Input name="name" placeholder="Template name" required />
            <textarea
              name="body"
              rows={8}
              placeholder="Write the agreement body using {{variables}}…"
              className={textareaClass}
              required
            />
            <Button type="submit" size="sm" className="w-fit">
              Create Template
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
