import { z } from 'zod';
import {
  AGE_RANGES,
  EXPERIENCE,
  INVEST_CHOICES,
  LIMITS,
  MONTHLY_INCOME,
  isEmail,
  normalizeEmail,
  normalizePhone,
  normalizeSource,
  type Choice,
} from '@/lib/application-fields';

/*
  The server's half of the application: what a submission must look like
  before a row is written. The form checks the same rules screen by screen,
  but the API route is a public endpoint and trusts none of that.
*/

const oneOf = (choices: Choice[]) =>
  z.string().refine((v) => choices.some((c) => c.value === v), 'Pick one.');

const longText = z.string().trim().min(3).max(LIMITS.longText);

export const applicationSchema = z.object({
  firstName: z.string().trim().min(1).max(LIMITS.firstName),
  email: z
    .string()
    .refine(isEmail, 'Invalid email.')
    .transform(normalizeEmail),
  // Required: the coach calls or texts every fit.
  phone: z.string().transform((v, ctx) => {
    const n = normalizePhone(v);
    if (!n) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Invalid phone.' });
      return z.NEVER;
    }
    return n;
  }),
  ageRange: oneOf(AGE_RANGES),
  goal: longText,
  obstacle: longText,
  experience: oneOf(EXPERIENCE),
  monthlyIncome: oneOf(MONTHLY_INCOME),
  investReady: oneOf(INVEST_CHOICES),
  source: z
    .string()
    .optional()
    .transform((v) => normalizeSource(v)),
  // The honeypot. A person never sees it, so anything in it is a bot.
  company: z.string().optional().default(''),
});

export type ApplicationInput = z.infer<typeof applicationSchema>;

/**
 * How long the same email is treated as the same application.
 *
 * A double tap, a back-and-resubmit or a flaky connection retrying should
 * produce one row and one ping on the coach's phone, not three.
 */
export const DUPLICATE_WINDOW_MS = 10 * 60 * 1000;

export function isRecentDuplicate(lastAt: Date | null | undefined, now: Date) {
  if (!lastAt) return false;
  return now.getTime() - lastAt.getTime() < DUPLICATE_WINDOW_MS;
}

/** The honeypot was filled in. */
export function isBot(input: { company?: string | null }) {
  return Boolean(input.company && input.company.trim());
}
