import { redirect } from 'next/navigation';
import { requireClient } from '@/lib/auth';
import { todayFor } from '@/lib/day';
import { featuresFor, hiddenRoutes, type Feature } from '@/lib/membership';

/*
  The server half of lib/membership: what the signed-in client's app includes.

  Hiding a nav item is not a boundary — a section is a URL and a server action
  is a public endpoint. So every page and action behind a feature calls
  requireFeature, and a member who types /messages lands on today's workout.
*/

export async function clientFeatures() {
  const user = await requireClient();
  const features = featuresFor(user.clientRecord, todayFor(user));
  return { user, features, hidden: hiddenRoutes(features) };
}

export async function requireFeature(feature: Feature) {
  const { user, features } = await clientFeatures();
  if (!features[feature]) redirect('/today');
  return user;
}
