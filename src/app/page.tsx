import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';

// Root of the app. Nobody actually lands here for long — send them
// wherever they belong based on whether they're signed in and what
// role they have.
export default async function RootPage() {
  const user = await getCurrentUser();

  if (!user) {
    // colbymullinscoaching.com is the address in his bios and ads, so a
    // stranger typing it in should land on the coaching page, not a login
    // form. The app's own address still opens on login for clients.
    const host = headers().get('host') ?? '';
    redirect(/colbymullinscoaching\.com$/i.test(host) ? '/coaching' : '/login');
  }

  if (user.role === 'coach' || user.role === 'admin') {
    redirect('/coach/dashboard');
  }

  redirect('/today');
}
