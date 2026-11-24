import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Halfdoor', template: '%s · Halfdoor' },
  description: "Halfdoor hands a parent's own words to the volunteer buddy, only while the child is checked in.",
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
