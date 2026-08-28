import type { Metadata, Viewport } from 'next';
import { getCurrentUser } from '@/lib/auth';
import { backgroundOf } from '@/lib/backgrounds';
import { Archivo, DM_Mono } from 'next/font/google';
import './globals.css';

/*
  Two faces, strictly divided.

  Archivo carries everything a person reads — and at its widest weight and
  width it's also the display face, so headlines and body share one family.
  DM Mono carries everything the *system* says about itself: counts,
  timestamps, statuses, labels. That split is what makes the interface read
  as a readout instead of a webpage, so don't blur it.
*/
const archivo = Archivo({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
  axes: ['wdth'],
});

const dmMono = DM_Mono({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'ARISE',
  description: 'Private coaching, built around the way you train.',
  manifest: '/manifest.json',
  icons: {
    icon: '/icon.png',
    apple: '/apple-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#03060e',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
    The signed-in person's background, stamped on <html>.

    It started on the client shell, which was wrong in two ways that only show
    up once a non-default theme is picked. The lit viewport frame below is a
    sibling of {children} in <body>, so it never inherited the override and
    drew an electric-blue border around an orange app. And `body` keeps its
    own `bg-background` from :root, so rubber-banding the top of the page on
    iOS revealed a band of the default navy behind the theme.

    Both are the same mistake — theming a descendant of the elements that
    actually paint the ground — and both go away by putting it at the root.

    getCurrentUser, not requireClient: this layout renders for the sign-in
    screen too, and a redirect from here would make the app unreachable.
  */
  const user = await getCurrentUser();
  const background = backgroundOf(user?.profile?.background);

  return (
    <html
      lang="en"
      data-bg={background}
      className={`${archivo.variable} ${dmMono.variable}`}
    >
      <body className="min-h-screen bg-background font-sans text-foreground">
        {/*
          The lit frame around the viewport. Desktop only — see
          `.viewport-frame` in globals.css. Rendered here rather than in each
          layout so the coach console and the client app are held by the same
          light, and so anything added later gets it without asking.
        */}
        <div aria-hidden className="viewport-frame" />
        {children}
      </body>
    </html>
  );
}
