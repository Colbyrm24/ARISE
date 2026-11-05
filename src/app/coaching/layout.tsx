import { MetaPixel } from '@/components/landing/meta-pixel';

/*
  Shared by /coaching and /coaching/apply. Its only job is to load the Meta
  Pixel on these public pages and nowhere else in ARISE.
*/
export default function CoachingLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <MetaPixel />
      {children}
    </>
  );
}
