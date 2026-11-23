import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted (see ./fonts/LICENSE.txt). next/font adds a size-adjusted Arial fallback, so swapping in the
// webfont does not shift the layout.
const generalSans = localFont({
  src: [
    { path: './fonts/GeneralSans-Regular.woff2', weight: '400', style: 'normal' },
    { path: './fonts/GeneralSans-Medium.woff2', weight: '500', style: 'normal' },
    { path: './fonts/GeneralSans-Semibold.woff2', weight: '600', style: 'normal' },
  ],
  variable: '--font-general-sans',
  display: 'swap',
  adjustFontFallback: 'Arial',
});

export const metadata: Metadata = {
  title: { default: 'Halfdoor', template: '%s · Halfdoor' },
  description: "Halfdoor hands a parent's own words to the volunteer buddy, only while the child is checked in.",
};

export const viewport: Viewport = {
  themeColor: '#f6f4ef',
  colorScheme: 'light',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${generalSans.variable} h-full`}>
      <body className="min-h-full bg-ground font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
