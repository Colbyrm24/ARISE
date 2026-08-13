import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

// Root of the app. Nobody actually lands here for long — send them
// wherever they belong based on whether they're signed in and what
// role they have.
export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect('/login');
  }

  if (user.role === 'coach' || user.role === 'admin') {
    redirect('/coach/dashboard');
  }

  redirect('/today');
}
