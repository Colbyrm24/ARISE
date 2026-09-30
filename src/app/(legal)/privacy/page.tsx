import type { Metadata } from 'next';
import Link from 'next/link';
import { CONTACT_EMAIL, OPERATOR, effectiveLine } from '@/lib/legal';

export const metadata: Metadata = {
  title: 'Privacy — ARISE',
  description: 'What ARISE collects, who can see it, and how to get it deleted.',
};

/*
  Written against the schema, not from a template.

  Every category below is a table that actually exists and a field that is
  actually written — progress photos, meal photos, voice notes, the health
  token, the audit log. A policy that lists less than the app collects is the
  expensive kind of wrong, and a generic one that lists more is its own
  problem: a client reads "we may collect location data" and reasonably
  assumes ARISE tracks where they are, which it has never done.

  The two disclosures that matter most, and the reason this page is longer
  than a template would be:

  1. Meal photos leave the app. They go to Anthropic to be read for macros.
     That is not something a person would guess from the interface, and it is
     the single thing on this page most likely to change somebody's mind about
     photographing their dinner.
  2. The coach sees everything. This is one person coaching by hand, not a
     platform with role-scoped analysts — and that's the product. Saying so
     plainly is more honest than a paragraph about "authorized personnel."
*/
export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy</h1>
      <p>{effectiveLine}</p>

      <p>
        ARISE is a private coaching app run by {OPERATOR}. It holds training,
        nutrition and body data that you enter, so that your coach can read it and
        write your program around it. That is the only reason it holds any of it.
      </p>
      <p>
        This page is written in plain language on purpose. If something here is
        unclear, write to{' '}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> and ask.
      </p>

      <h2>What ARISE collects</h2>

      <h3>Your account</h3>
      <p>
        Your email address, and a password you set. The password is handled by our
        sign-in provider and is never stored by ARISE in a form anyone can read —
        not by your coach either. You can also add a name, a photo, a phone number
        and your time zone, and none of those are required.
      </p>

      <h3>What you log</h3>
      <ul>
        <li>Bodyweight, body measurements and step counts.</li>
        <li>Progress photos, if you take them.</li>
        <li>
          Meals — what you ate, the macros, and photographs of food if you send
          them.
        </li>
        <li>Workouts: the exercises, the weights, the reps, the cardio.</li>
        <li>Weekly check-ins and how you answered them.</li>
        <li>
          Your onboarding answers, including injuries and limitations you tell us
          about, and the equipment you have.
        </li>
      </ul>

      <h3>Messages</h3>
      <p>
        The messages between you and your coach, including photos, files and voice
        notes you attach. These are kept so the thread still exists tomorrow.
      </p>

      <h3>Apple Health, only if you set it up</h3>
      <p>
        ARISE can accept steps and bodyweight sent from your iPhone. This only
        happens if you create a token in the app and set up the export yourself.
        Nothing is read from your phone otherwise, and only steps, bodyweight and
        a calorie total are accepted — not your wider Health record. Deleting the
        token stops it.
      </p>

      <h3>Payments</h3>
      <p>
        Payments run through Stripe. <strong>Card numbers never reach ARISE</strong>{' '}
        — they go to Stripe directly. ARISE stores what you bought, what it cost,
        whether it was paid, and Stripe&rsquo;s reference for the payment.
      </p>

      <h3>Your coaching agreement</h3>
      <p>
        If you sign a coaching agreement in the app, ARISE records the name you
        typed, the time you signed, your IP address and your browser. That is
        stored for the same reason any signature is: so the agreement can be shown
        to have been signed.
      </p>

      <h3>Notifications and technical records</h3>
      <ul>
        <li>
          If you turn on notifications, ARISE stores the address your browser gives
          it for pushing to that device, plus the keys needed to encrypt the push
          and a description of the browser. Turning notifications off deletes it.
        </li>
        <li>
          A record of significant actions — who changed a program, who marked a
          payment paid — with a timestamp, so that changes can be traced.
        </li>
        <li>
          Our host keeps ordinary server logs of requests. ARISE does not run
          advertising or third-party analytics trackers, and there are no
          advertising cookies.
        </li>
      </ul>

      <h2>Who can see it</h2>
      <p>
        <strong>Your coach can see everything you log.</strong> That is what
        coaching is — your weight, your photos, your meals, your lifts, your
        messages. ARISE is run by one coach working by hand, not a company with
        departments, so there is no larger staff reading your data.
      </p>
      <p>
        Other clients cannot see any of it. Your progress photos and meal photos
        are stored privately and can only be opened through short-lived links the
        app generates for you and your coach.
      </p>

      <h2>Companies ARISE relies on</h2>
      <p>
        These are service providers, not buyers. They handle data on ARISE&rsquo;s
        behalf and are not allowed to use it for their own purposes.
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> — the database, file storage and sign-in.
          Everything you log lives here.
        </li>
        <li>
          <strong>Vercel</strong> — hosting. Runs the app and keeps request logs.
        </li>
        <li>
          <strong>Stripe</strong> — payments and card handling.
        </li>
        <li>
          <strong>Anthropic</strong> — reads food photos to estimate macros, and
          drafts message replies for your coach to edit before sending. See below.
        </li>
      </ul>

      <h3>What goes to Anthropic, and what doesn&rsquo;t</h3>
      <p>
        When you photograph a meal, that photo and any note you wrote with it are
        sent to Anthropic&rsquo;s API to be read for calories and macros. The
        result comes back as a first pass; your coach checks and corrects it. Your
        coach may also have a reply to one of your messages drafted, which sends
        the recent messages in that thread and a summary of your day.
      </p>
      <p>
        Anthropic processes this to answer the request and does not use it to train
        their models. Your name, email and payment details are not sent. If you
        would rather nothing of yours went there, log meals by searching foods
        instead of photographing them, and tell your coach.
      </p>
      <p>
        <strong>ARISE does not sell your data,</strong> and does not share it with
        anyone for advertising. The only other way it leaves is if the law
        requires it.
      </p>

      <h2>How long it&rsquo;s kept</h2>
      <p>
        While you have an account, your history is kept — a year of weights and
        check-ins is the useful part of coaching, so nothing is quietly aged out.
      </p>
      <p>
        When you delete your account, your logs, photos, measurements, messages and
        notifications are deleted. Payment records are kept as long as tax and
        accounting rules require, and Stripe keeps its own record of transactions
        under its own policy. A signed coaching agreement is kept, together with
        what was recorded at signing, because a contract stops being a contract if
        the record of it being agreed to is thrown away.
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>
          <strong>See it</strong> — everything ARISE holds about you is visible in
          the app.
        </li>
        <li>
          <strong>Fix it</strong> — you can edit or delete any individual log,
          photo or measurement yourself.
        </li>
        <li>
          <strong>Get a copy</strong> — email and ask, and you&rsquo;ll be sent
          your data.
        </li>
        <li>
          <strong>Delete it</strong> — go to Profile and choose Delete account, or
          email and ask. See <Link href="/terms">the terms</Link> for what happens
          to a subscription when you do.
        </li>
        <li>
          <strong>Turn off notifications</strong> — from Profile, on each device.
        </li>
      </ul>
      <p>
        Depending on where you live you may have further rights over your data,
        including the right to object to how it is used. Email and ask; ARISE does
        not charge for any of this and will not make you a worse offer for asking.
      </p>

      <h2>Security</h2>
      <p>
        Data is encrypted in transit, photos are stored in private buckets reachable
        only through expiring links, health-sync tokens are hashed rather than
        stored as written, and each page checks who you are against the sign-in
        provider before it shows you anything. No system is perfect; if something
        goes wrong that affects your data, you will be told.
      </p>

      <h2>Age</h2>
      <p>
        ARISE is for adults. Do not create an account if you are under 18. If we
        learn an account belongs to someone under 18, it will be deleted.
      </p>

      <h2>Changes</h2>
      <p>
        If this page changes in a way that matters, the effective date at the top
        changes and you&rsquo;ll be told in the app before it applies.
      </p>

      <h2>Contact</h2>
      <p>
        {OPERATOR} — <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
      </p>
    </>
  );
}
