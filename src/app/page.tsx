import type { Metadata } from 'next';
import { Landing } from '@/components/landing/Landing';

export const metadata: Metadata = {
  title: { absolute: 'Halfdoor — every child, known at the door' },
  description:
    "Parents write about their child in their own words; the volunteer buddy sees a card made from those words, only while the child is checked in.",
};

/** Public repo link for the nav and footer; hidden when unset. */
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL?.trim() || null;

export default function Home() {
  return <Landing repoUrl={REPO_URL} />;
}
