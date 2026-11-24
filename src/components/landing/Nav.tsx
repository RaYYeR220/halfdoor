import type { Ref } from 'react';
import { BrandMark } from './icons';

type Props = { repoUrl: string | null; ref?: Ref<HTMLElement> };

/** The landing's top bar. /demo is a route handler that makes a sandbox, so it is a plain link (never prefetched). */
export function Nav({ repoUrl, ref }: Props) {
  return (
    <header className="nav wrap rise" ref={ref}>
      <a className="brand" href="#" aria-label="Halfdoor home">
        <BrandMark />
        Halfdoor
      </a>
      <nav aria-label="Primary">
        <a href="#how">How it works</a>
        <a href="#privacy">Privacy</a>
        <a href="#measured">Measured</a>
        {repoUrl && <a href={repoUrl}>Source code</a>}
      </nav>
      <a className="btn btn-quiet" href="/demo">
        Try the demo church
      </a>
    </header>
  );
}
