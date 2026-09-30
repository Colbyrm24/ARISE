import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, GOVERNING_STATE, OPERATOR, effectiveLine } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Terms — ARISE',
  description: 'The terms of using ARISE, and the limits of what coaching is.',
};

/*
  Two things carry real weight on this page, and everything else is scaffolding
  around them.

  The first is the medical section. ARISE takes bodyweight, injuries, food and
  training load from people and returns a program — which is exactly the shape
  of an activity that gets mistaken for medical advice. Saying clearly that it
  isn't, and that a client should get cleared before starting, is the sentence
  most worth having written down before the first client signs.

  The second is that the signed coaching agreement outranks this page on
  anything to do with money. Plans here have a term, a payment count and a
  contract total, all of which are printed on the agreement a client signs.
  Writing a cancellation or refund rule into this page would create a second,
  conflicting promise about the same thing — so this page states the order of
  precedence and stops.
*/
export default function TermsPage() {
  return (
    <>
      <h1>Terms of Use</h1>
      <p>{effectiveLine}</p>

      <p>
        ARISE is a private online coaching app operated by {OPERATOR}. By creating
        an account or using the app, you agree to what&rsquo;s on this page. If you
        don&rsquo;t, don&rsquo;t use it.
      </p>

      <h2>Who can use it</h2>
      <p>
        You must be at least 18 years old and able to enter into a contract. One
        account per person, and the account is yours — don&rsquo;t share your
        sign-in with anyone else. You&rsquo;re responsible for what happens under
        your account, so tell us if you think somebody else has access to it.
      </p>

      <h2>What ARISE is</h2>
      <p>
        ARISE gives you a place to log training, food, bodyweight and photos, and
        gives your coach a place to read them and write your program. The coaching
        itself is a person — the app is how the two of you work together, not a
        replacement for either of you.
      </p>

      <h2>This is not medical advice</h2>
      <p>
        <strong>
          Your coach is not a doctor, a dietitian or a physical therapist, and
          nothing in ARISE is medical advice, diagnosis or treatment.
        </strong>{' '}
        Programs, macro targets and calorie numbers are coaching guidance built from
        what you tell us.
      </p>
      <p>
        Before you start training or change how you eat, get cleared by a doctor —
        especially if you are pregnant, have an injury, or have any heart, metabolic
        or other medical condition. Keep taking any medication you have been
        prescribed and do not change it based on anything here.
      </p>
      <p>
        <strong>Stop and get medical help</strong> if you feel chest pain,
        faintness, unusual shortness of breath, or pain that is sharp rather than
        muscular. Training carries a real risk of injury, and by using ARISE you
        accept that risk for yourself. Tell your coach about injuries and
        limitations, and tell them when something changes — they can only work with
        what they know.
      </p>

      <h2>Food photos and macro estimates</h2>
      <p>
        When you photograph a meal, the calories and macros that come back are an{' '}
        <strong>estimate</strong>, produced automatically and then checked by your
        coach. They are not a measurement. Portions, oils, sauces and anything out
        of frame all move the number. Treat them as a working figure and correct
        anything you know to be wrong. If you have a food allergy or a medical
        reason to control an ingredient, do not rely on a photo estimate to tell you
        what is in your food.
      </p>

      <h2>Your part of it</h2>
      <ul>
        <li>Log honestly. Coaching built on numbers you made up doesn&rsquo;t work.</li>
        <li>
          Don&rsquo;t upload anything you don&rsquo;t have the right to upload, and
          don&rsquo;t upload photos of anyone else.
        </li>
        <li>
          Don&rsquo;t try to break into parts of the app that aren&rsquo;t yours,
          scrape it, or resell access to it.
        </li>
        <li>
          Keep it civil. Messages are between you and your coach; abuse or
          harassment ends the arrangement.
        </li>
      </ul>

      <h2>Payment</h2>
      <p>
        What you pay, how often, for how long, and what the whole program costs are
        set out in the coaching agreement you sign before you start. Payments are
        processed by Stripe; card details go to Stripe, not to ARISE.
      </p>
      <p>
        <strong>
          Where this page and your signed coaching agreement say different things
          about money — price, term, number of payments, cancellation, refunds — the
          agreement controls.
        </strong>{' '}
        You can see your plan and open Stripe&rsquo;s billing portal from your
        profile to update a card or view invoices.
      </p>
      <p>
        If a payment fails, your coach will tell you and you&rsquo;ll get a chance
        to fix it. Access may be paused while an account is unpaid.
      </p>

      <h2>Ending it</h2>
      <p>
        You can stop using ARISE whenever you want, and you can delete your account
        from your profile. Deleting your account removes your logs, photos and
        messages — see the <Link href="/privacy">privacy policy</Link> for exactly
        what goes and what is kept.
      </p>
      <p>
        <strong>
          Deleting your account does not by itself cancel a paid coaching term or
          waive payments you already agreed to,
        </strong>{' '}
        and it does not cancel a Stripe subscription. If you want to end coaching,
        say so to your coach first, so the billing is actually stopped.
      </p>
      <p>
        Coaching can also be ended from this side — for non-payment, for abusive
        behaviour, or if it simply isn&rsquo;t working. If that happens you&rsquo;ll
        be told, and any term you already paid for will be honoured or settled.
      </p>

      <h2>What belongs to whom</h2>
      <p>
        The app, the programs, the templates and the written material in ARISE
        belong to {OPERATOR}. You get to use them for your own training while
        you&rsquo;re a client. Don&rsquo;t redistribute them, sell them, or coach
        other people off them.
      </p>
      <p>
        Your data is yours. Your logs, measurements, photos and messages stay
        yours; you give ARISE permission to store and display them so that your
        coach can do the coaching. Nothing you upload is used in advertising, and
        nothing of yours is published anywhere without you asking for it.
      </p>

      <h2>The app itself</h2>
      <p>
        ARISE is provided as it is. It is a small app run by one coach, not
        infrastructure with an uptime guarantee — it may be down, a notification may
        not arrive, and features will change. To the fullest extent the law allows,
        there are no warranties beyond what is written here, and {OPERATOR} is not
        liable for indirect or consequential losses. Where liability cannot be
        excluded, it is limited to the amount you paid in the twelve months before
        the claim.
      </p>
      <p>
        Nothing here removes rights you have by law that cannot be signed away —
        including, in some places, rights about death or personal injury caused by
        negligence.
      </p>

      <h2>Changes</h2>
      <p>
        These terms can change. When they do, the effective date at the top changes
        and you&rsquo;ll be told in the app before the new version applies to you.
        Continuing to use ARISE after that means you accept it.
      </p>

      <h2>Governing law</h2>
      <p>
        {GOVERNING_STATE
          ? `These terms are governed by the laws of the State of ${GOVERNING_STATE}, without regard to its conflict-of-laws rules, and any dispute will be heard in the courts located there.`
          : 'These terms are governed by the laws of the state in which ARISE is operated, without regard to its conflict-of-laws rules, and any dispute will be heard in the courts located there.'}{' '}
        Before filing anything, email and try to sort it out — most things are a
        misunderstanding about a charge and take one message to fix.
      </p>

      <h2>Contact</h2>
      <p>
        {OPERATOR} — <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </>
  );
}
