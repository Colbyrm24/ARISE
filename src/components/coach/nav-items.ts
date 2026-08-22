import {
  LayoutDashboard,
  Users,
  Inbox,
  Camera,
  CalendarDays,
  ClipboardList,
  Dumbbell,
  UtensilsCrossed,
  CreditCard,
  Settings,
  type LucideIcon,
} from 'lucide-react';

/*
  One list of destinations, used by both the sidebar and the phone sheet.

  Kept in its own file because the sidebar is a client component and so is the
  sheet — sharing the array through either of them would drag one into the
  other's bundle for no reason.
*/
export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only the meals queue carries one today; typed so more can. */
  badge?: 'pendingMeals';
};

export const NAV_ITEMS: NavItem[] = [
  { href: '/coach/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/coach/clients', label: 'Clients', icon: Users },
  { href: '/coach/inbox', label: 'Inbox', icon: Inbox },
  { href: '/coach/meals', label: 'Meals', icon: Camera, badge: 'pendingMeals' },
  { href: '/coach/schedule', label: 'Schedule', icon: CalendarDays },
  { href: '/coach/programs', label: 'Programs', icon: ClipboardList },
  { href: '/coach/exercises', label: 'Exercises', icon: Dumbbell },
  { href: '/coach/recipes', label: 'Recipes', icon: UtensilsCrossed },
  { href: '/coach/payments', label: 'Payments', icon: CreditCard },
  { href: '/coach/settings', label: 'Settings', icon: Settings },
];
