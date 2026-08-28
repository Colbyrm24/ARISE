import type { Metadata, Viewport } from 'next';
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

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={`${archivo.variable} ${dmMono.variable}`}>
      <body className="min-h-screen bg-background font-sans text-foreground">
        {/*
          The lit frame moved OUT of here and into each top-level layout.

          It reads --accent, --foreground and --system, and as a sibling of
          {children} in <body> it could never inherit a client's chosen
          background — so somebody on the orange theme got an electric-blue
          border drawn around their whole app, which was then the loudest
          thing on the screen and the wrong colour. Rendered inside each shell
          it picks up whatever tokens that shell is wearing.

          This layout stays sync and data-free on purpose. Reading the theme
          here would mean an auth round trip and a database query on every
          request for every route, sign-in included, and a build-time render
          of the not-found page with no request to read a cookie from.
        */}
        {children}
      </body>
    </html>
  );
}
