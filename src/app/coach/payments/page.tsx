import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BILLING_TYPE_LABELS, PAYMENT_FREQUENCY_LABELS, PROVIDER_LABELS } from '@/lib/plans';
import {
  createPlan,
  togglePlanActive,
  createAgreementTemplate,
  updateAgreementTemplate,
  setDefaultAgreementTemplate,
} from './actions';

const selectClass =
  'flex h-11 w-full rounded-xl border border-input bg-secondary/40 px-4 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

const textareaClass =
  'w-full resize-none rounded-xl border border-border bg-secondary/30 p-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring';

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
                      {link.status}
                    </Badge>
                  </Link>
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

          {templates.map((template) => (
            <form
              key={template.id}
              action={updateAgreementTemplate}
              className="flex flex-col gap-3 rounded-xl border border-border bg-secondary/20 p-4"
            >
              <input type="hidden" name="templateId" value={template.id} />
              <div className="flex items-center justify-between gap-3">
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
              <textarea name="body" rows={10} defaultValue={template.body} className={textareaClass} />
              <Button type="submit" size="sm" className="w-fit">
                Save Changes
              </Button>
            </form>
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
