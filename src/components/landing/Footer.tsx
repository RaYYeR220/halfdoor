import Link from 'next/link';
import { en } from '@/lib/i18n/en';
import { ArrowRight, BrandMark } from './icons';

/** 9 · Footer: the fictional-church note, credits, and the way into the demo. */
export function Footer({ repoUrl }: { repoUrl: string | null }) {
  return (
    <footer className="foot">
      <div className="wrap">
        <div className="foot-top">
          <Link className="brand" href="/" aria-label="Halfdoor home">
            <BrandMark />
            Halfdoor
          </Link>
          <a className="btn btn-cta" href="/demo">
            Try the demo church <ArrowRight />
          </a>
        </div>
        <p className="fict">Fernbrook Community Church is a fictional demo church with sample data.</p>
        <p className="fict">Built for the AI for Church Hackathon 2026.</p>
        <nav className="foot-links" aria-label="Footer">
          <a href="/demo">Demo church</a>
          <a href="#privacy">Privacy</a>
          {repoUrl && <a href={repoUrl}>Source code</a>}
          <span className="credit">{en['pack.sheet.arasaac']}</span>
          <span className="credit">Scripture: Berean Standard Bible (BSB), public domain.</span>
        </nav>
      </div>
    </footer>
  );
}
