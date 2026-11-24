'use client';
// Sentences that read like safety information but did not make it into the Safety section. The parent decides:
// add the sentence word for word, or say no.
import type { SafetyPrompt } from '@/lib/card/schema';
import { useT } from '@/lib/i18n/client';
import { promptMarkId } from '@/lib/parent/highlight';
import { Button } from '@/components/ui/Button';
import { Icon } from '@/components/ui/Icon';

type Props = {
  prompts: readonly SafetyPrompt[];
  lang?: string;
  onAccept: (id: string) => void;
  onDecline: (id: string) => void;
  onPreview: (markId: string | null) => void;
  idPrefix: string;
};

export function SafetyPrompts({ prompts, lang, onAccept, onDecline, onPreview, idPrefix }: Props) {
  const t = useT();
  if (prompts.length === 0) return null;

  // The prompt that was answered leaves the list; keep keyboard focus on the next one, or on the Safety section.
  const settle = (index: number, after: (id: string) => void, id: string) => {
    after(id);
    requestAnimationFrame(() => {
      const next = prompts[index + 1] ?? prompts[index - 1];
      const target = next ? document.getElementById(`${idPrefix}-prompt-${next.id}-add`) : document.getElementById(`${idPrefix}-sec-safety`);
      if (target) {
        if (!next) target.setAttribute('tabindex', '-1');
        target.focus();
      }
    });
  };

  return (
    <ul className="flex flex-col gap-3" aria-label={t('parent.prompt.listLabel')}>
      {prompts.map((p, i) => (
        <li
          key={p.id}
          onPointerEnter={(e) => e.pointerType === 'mouse' && onPreview(promptMarkId(p.id))}
          onPointerLeave={(e) => e.pointerType === 'mouse' && onPreview(null)}
          onFocus={() => onPreview(promptMarkId(p.id))}
          onBlur={() => onPreview(null)}
          className="rounded-sharp border border-danger-line bg-surface px-4 py-3.5 sm:px-5"
        >
          <p className="flex items-center gap-2 text-15 font-medium text-danger-ink">
            <Icon name="alert" size={14} />
            {t('parent.prompt.title')}
          </p>
          <p lang={lang} className="mt-1.5 text-17 leading-[1.5] text-ink text-pretty">
            “{p.sentence.trim()}”
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button id={`${idPrefix}-prompt-${p.id}-add`} size="sm" variant="secondary" onClick={() => settle(i, onAccept, p.id)}>
              {t('parent.prompt.add')}
            </Button>
            <Button size="sm" variant="quiet" onClick={() => settle(i, onDecline, p.id)}>
              {t('parent.prompt.no')}
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}
