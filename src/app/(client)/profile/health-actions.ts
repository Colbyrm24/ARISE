'use server';

import { revalidatePath } from 'next/cache';
import { requireClient } from '@/lib/auth';
import { issueHealthToken } from '@/lib/health-token';

/**
 * Issues the client a token for posting their own steps and weight.
 *
 * Returned rather than stored anywhere readable — only the hash is kept, so
 * this string exists in one place for about thirty seconds and then never
 * again. Reissuing invalidates the old one, which is also how a client on a
 * new phone gets going.
 */
export async function createHealthToken(): Promise<{ token: string }> {
  const user = await requireClient();
  const token = await issueHealthToken(user.id);
  revalidatePath('/profile');
  return { token };
}
