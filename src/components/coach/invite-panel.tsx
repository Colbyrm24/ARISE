import { X } from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { getSiteUrl } from '@/lib/site-url';
import { Button } from '@/components/ui/button';
import { CopyLinkButton } from '@/components/copy-link-button';
import { SystemWindow, SystemWindowContent } from '@/components/ui/system-window';
import { describePaymentStructure } from '@/lib/plans';
import { appliedPrice } from '@/lib/payment-link';
import { createClientInvite, revokeClientInvite } from '@/app/coach/clients/invite-actions';

/*
  Adding somebody who isn't a client yet.

  This is the step that did not exist. The coach could only ever act on
  people who had already found /signup themselves, so starting a new client
  meant telling them to go and make an account, waiting, and then coming back
  here to make a payment link — two asks and a gap, at the exact moment
  somebody is most likely to go cold.

  One link now. He picks the plan, adjusts the couple of numbers that differ
  for this person, and texts what comes out. The client's account, their
  payment and their agreement all run off it.
*/

const fieldClass =
  'h-9 min-w-0 rounded-none border border-input bg-secondary/40 px-2 text-sm placeholder:text-muted-foreground focus-visible:border-accent/60 focus-visible:outline-none';
const selectClass =
  'readout h-9 rounded-none border border-input bg-secondary/40 px-2 text-[11px] uppercase tracking-wider focus-visible:border-accent/60 focus-visible:outline-none';

function loadInvites(coachId: string) {
  return prisma.clientInvite.findMany({
    where: { coachId, usedAt: null, deletedAt: null },
    include: { plan: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
}

export async function InvitePanel({ coachId }: { coachId: string }) {
  /*
    The table can lag the code by a few minutes.

    A migration is applied by hand in Supabase and a deploy takes about a
    minute, so there is a window where this component is live and
    `client_invites` does not exist yet. Unguarded, that window takes down
    the whole client roster — the screen the coach uses most — over a feature
    he hasn't started using. So a missing table degrades to a note.
  */
  let plans, templates;
  let invites: Awaited<ReturnType<typeof loadInvites>> = [];
  try {
    [plans, templates, invites] = await Promise.all([
      prisma.plan.findMany({ where: { active: true }, orderBy: { name: 'asc' } }),
      prisma.agreementTemplate.findMany({ orderBy: [{ isDefault: 'desc' }, { name: 'asc' }] }),
      loadInvites(coachId),
    ]);
  } catch (err) {
    console.error('Could not load the invite panel', {
      error: err instanceof Error ? err.message : String(err),
    });
    return (
      <SystemWindow title="Add a client">
        <SystemWindowContent className="pt-4">
          {/*
            Two migrations can land here now, and naming the wrong one sends
            him hunting. client-invite-migration.sql creates the table;
            existing-client-migration.sql adds the skip-payment columns to it.
            The second is the likely one — the table has been live for a
            while — so it is named first.
          */}
          <p className="text-sm text-muted-foreground">
            Inviting clients needs a database change that hasn&apos;t been applied yet — run{' '}
            <code className="readout text-xs">prisma/existing-client-migration.sql</code> in
            Supabase (and{' '}
            <code className="readout text-xs">prisma/client-invite-migration.sql</code> first, if
            you never have) and this turns on.
          </p>
        </SystemWindowContent>
      </SystemWindow>
    );
  }

  const origin = getSiteUrl();
  const today = new Date().toISOString().slice(0, 10);

  /*
    Only a plan is genuinely required now. An existing-client link signs
    nothing, so gating the whole panel on having an agreement template would
    block the one route that needs no agreement — and that is the route he
    wants this week, moving people across from Trainerize.
  */
  if (plans.length === 0) {
    return (
      <SystemWindow title="Add a client">
        <SystemWindowContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            You need at least one plan before you can invite anybody. Plans live on the Payments
            screen.
          </p>
        </SystemWindowContent>
      </SystemWindow>
    );
  }

  return (
    <SystemWindow title="Add a client">
      <SystemWindowContent className="flex flex-col gap-4 pt-4">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Pick their plan, change anything that&apos;s different for this person, and send them
          the link. They make an account, pay, sign, and land in the app without you touching it
          again.
        </p>

        {templates.length === 0 && (
          <p className="readout text-[10px] uppercase leading-relaxed text-[hsl(var(--destructive))]">
            No agreement template yet, so paying links can&apos;t be made — add one on the Payments
            screen. Existing-client links still work.
          </p>
        )}

        <form action={createClientInvite} className="flex flex-col gap-2">
          <input
            name="name"
            maxLength={80}
            placeholder="Their name (so you know whose link this is)"
            className={fieldClass}
          />

          {/*
            The switch that decides whether this link asks for money.

            He is moving a book of clients off Trainerize and those people are
            already paying him on their own plans. Sending them through the
            checkout would charge them a second time, and if they refused they
            would sit at payment_pending unable to open the app he just told
            them to download. Ticking this makes the account, attaches them to
            him, and drops them straight into the intake.
          */}
          <label className="flex items-start gap-2 border border-dashed border-border/70 p-2.5">
            <input
              type="checkbox"
              name="skipPayment"
              className="mt-0.5 h-4 w-4 shrink-0 accent-[hsl(var(--accent))]"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-[13px]">They already pay me somewhere else</span>
              <span className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">
                No checkout and no agreement. They sign up and go straight to the intake. Set
                Starts to the date they actually began with you.
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <select name="planId" aria-label="Plan" className={selectClass} required>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {/*
              Not `required`: a skip-payment invite has nothing to sign, and a
              browser-level requirement here would block the submit with no
              visible reason on the one form he uses for both. The action does
              the real check — it refuses a PAYING invite with no template.
            */}
            <select
              name="agreementTemplateId"
              aria-label="Agreement template"
              className={selectClass}
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2">
              <span className="readout text-[10px] uppercase text-muted-foreground">Starts</span>
              <input
                type="date"
                name="startDate"
                defaultValue={today}
                required
                className={`readout ${fieldClass}`}
              />
            </label>
          </div>

          {/*
            The three levers that actually differ per person. Leave them empty
            and the plan's own numbers are used — which is the common case, so
            they're placeholders rather than pre-filled values.
          */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1">
              <span className="readout text-[10px] uppercase text-muted-foreground">
                Price override
              </span>
              <input
                name="priceOverride"
                inputMode="decimal"
                placeholder="plan price"
                className={`readout ${fieldClass}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="readout text-[10px] uppercase text-muted-foreground">
                No. of payments
              </span>
              <input
                name="numberOfPaymentsOverride"
                inputMode="numeric"
                placeholder="plan default"
                className={`readout ${fieldClass}`}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="readout text-[10px] uppercase text-muted-foreground">
                Term months
              </span>
              <input
                name="termMonthsOverride"
                inputMode="numeric"
                placeholder="plan default"
                className={`readout ${fieldClass}`}
              />
            </label>
          </div>

          <p className="readout text-[10px] uppercase leading-relaxed text-muted-foreground">
            Price override is ignored on plans imported from Stripe — Stripe charges what its own
            price says, and the agreement has to match the money.
          </p>

          <Button type="submit" size="sm" variant="secondary" className="self-start">
            Make the link
          </Button>
        </form>

        {invites.length > 0 && (
          <div className="flex flex-col border-t border-border/60 pt-3">
            <span className="readout pb-1 text-[10px] uppercase text-muted-foreground">
              Links waiting to be used
            </span>
            {invites.map((invite) => {
              const { effective } = appliedPrice(
                invite.plan,
                invite.priceOverride === null ? null : Number(invite.priceOverride)
              );
              return (
                <div
                  key={invite.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border/40 py-2.5 last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-baseline gap-2 truncate text-sm">
                      {invite.name ?? 'Unnamed'}
                      {/*
                        Which kind of link this is, on the row. Two links that
                        look identical but one charges and one does not is
                        exactly the pair you do not want to send to the wrong
                        person.
                      */}
                      {invite.skipPayment && (
                        <span className="readout shrink-0 text-[9px] uppercase tracking-wider text-accent">
                          No payment
                        </span>
                      )}
                    </p>
                    <p className="readout mt-0.5 text-[10px] text-muted-foreground">
                      {invite.plan.name} ·{' '}
                      {invite.skipPayment
                        ? 'already paying elsewhere'
                        : describePaymentStructure({
                            price: effective,
                            billingType: invite.plan.billingType,
                            paymentFrequency: invite.plan.paymentFrequency,
                            numberOfPayments:
                              invite.numberOfPaymentsOverride ?? invite.plan.numberOfPayments,
                          })}
                    </p>
                  </div>
                  <CopyLinkButton url={`${origin}/join/${invite.token}`} />
                  <form action={revokeClientInvite} className="flex shrink-0">
                    <input type="hidden" name="inviteId" value={invite.id} />
                    <button
                      type="submit"
                      aria-label={`Withdraw the invite for ${invite.name ?? 'this person'}`}
                      className="p-1 text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X size={13} />
                    </button>
                  </form>
                </div>
              );
            })}
          </div>
        )}
      </SystemWindowContent>
    </SystemWindow>
  );
}
