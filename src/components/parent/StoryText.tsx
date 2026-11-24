'use client';
// The parent's own text with every quoted run marked. The marked runs of the active line are lit; clicking a
// marked run opens the card line it feeds (keyboard users reach the same link from the card's line buttons).
import { useMemo } from 'react';
import { cx } from '@/lib/cx';
import { buildSegments, lineIdsOf, type MarkSource } from '@/lib/parent/highlight';

type Props = {
  story: string;
  sources: readonly MarkSource[];
  /** Line or prompt id whose words are lit. */
  active: string | null;
  onPick: (lineId: string) => void;
  lang?: string;
  className?: string;
};

export function StoryText({ story, sources, active, onPick, lang, className }: Props) {
  const segments = useMemo(() => buildSegments(story.length, sources), [story.length, sources]);
  return (
    <p lang={lang} className={cx('text-17 leading-[1.8] whitespace-pre-wrap text-ink-2 text-pretty', className)}>
      {segments.map((seg) => {
        const text = story.slice(seg.start, seg.end);
        if (!seg.tone) return <span key={seg.start}>{text}</span>;
        const lit = !!active && seg.ids.includes(active);
        const dim = !!active && !lit;
        const lines = lineIdsOf(seg);
        // One class per property and state (no base colour to fight with): lit, resting, or dimmed behind a lit line.
        const look = lit
          ? seg.tone === 'line'
            ? 'bg-accent-tint text-accent-ink decoration-accent'
            : 'bg-danger-bg text-danger-ink decoration-danger-ink'
          : seg.tone === 'prompt'
            ? 'bg-transparent text-ink-2 decoration-danger-ink/50 decoration-dotted'
            : seg.tone === 'safety'
              ? cx('text-ink-2 decoration-transparent', dim ? 'bg-danger-bg/45' : 'bg-danger-bg')
              : cx('text-ink-2 decoration-transparent', dim ? 'bg-accent-tint/30' : 'bg-accent-tint/70');
        return (
          <mark
            key={seg.start}
            data-ids={seg.ids.join(' ')}
            data-lit={lit || undefined}
            onClick={lines.length > 0 ? () => onPick(lines[0]) : undefined}
            className={cx(
              'rounded-[2px] box-decoration-clone underline decoration-2 underline-offset-[5px]',
              'transition-[background-color,color,text-decoration-color] duration-200 ease-out',
              lines.length > 0 && 'cursor-pointer',
              look,
            )}
          >
            {text}
          </mark>
        );
      })}
    </p>
  );
}
