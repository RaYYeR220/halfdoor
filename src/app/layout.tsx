import type { Metadata, Viewport } from 'next';
import './globals.css';

const DESCRIPTION = "Halfdoor hands a parent's own words to the volunteer buddy, only while the child is checked in.";
const SOCIAL_TITLE = 'Halfdoor — every child, known at the door';

/** Absolute base for social image URLs. Unset: Next uses the Vercel production/preview URL, or localhost. */
const SITE_URL = (() => {
  try {
    return process.env.APP_URL ? new URL(process.env.APP_URL) : undefined;
  } catch {
    return undefined;
  }
})();

export const metadata: Metadata = {
  metadataBase: SITE_URL,
  title: { default: 'Halfdoor', template: '%s · Halfdoor' },
  description: DESCRIPTION,
  // public/og.png is the hero's unlocked key frame at 1200×630 (Leo's card, open at check-in).
  openGraph: {
    type: 'website',
    siteName: 'Halfdoor',
    title: SOCIAL_TITLE,
    description: DESCRIPTION,
    images: [{ url: '/og.png', width: 1200, height: 630, alt: "Halfdoor: Leo's card on the buddy's phone, made from his mom's own words, unlocked at check-in." }],
  },
  twitter: { card: 'summary_large_image', title: SOCIAL_TITLE, description: DESCRIPTION, images: ['/og.png'] },
};

export const viewport: Viewport = {
  themeColor: '#f6f4ef',
  colorScheme: 'light',
};

// General Sans loads from Fontshare's CDN in the browser (one family per request: Fontshare serves only the first).
// The build never touches Fontshare; until the font arrives, a metric-matched fallback holds the layout (globals.css).
const FONT_CSS = 'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap';

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className="h-full">
      <head>
        <link rel="preconnect" href="https://api.fontshare.com" crossOrigin="" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href={FONT_CSS} />
      </head>
      <body className="min-h-full bg-ground font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
