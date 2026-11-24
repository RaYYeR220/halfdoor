'use client';
// How much help the child needs, in the parent's words for the kids' team. Required before approving.
import { useT } from '@/lib/i18n/client';
import { Radio } from '@/components/ui/Radio';

export type SupportLevel = 'all_morning' | 'parts' | 'none';

type Props = { childName: string; value: SupportLevel | null; onChange: (v: SupportLevel) => void; error: boolean; name: string };

export function SupportLevelField({ childName, value, onChange, error, name }: Props) {
  const t = useT();
  const options = (['all_morning', 'parts', 'none'] as const).map((v) => ({
    value: v,
    label: t(`parent.support.${v}`),
    description: t(`parent.support.${v}.desc`, { name: childName }),
  }));
  return (
    <div>
      <Radio<SupportLevel>
        name={name}
        legend={t('parent.support.legend', { name: childName })}
        hint={error ? undefined : t('parent.support.hint')}
        options={options}
        value={value ?? ('' as SupportLevel)}
        onChange={onChange}
      />
      {error && (
        <p role="alert" className="mt-2 text-15 text-danger-ink">
          {t('parent.support.required')}
        </p>
      )}
    </div>
  );
}
