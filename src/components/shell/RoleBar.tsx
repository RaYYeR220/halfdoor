'use client';
// "Viewing as": the sandbox persona switcher. A menu button listing the demo church's people by group;
// picking one switches the hd_as cookie (POST /api/sandbox/as) and opens that person's home page.
import { useEffect, useId, useRef, useState, useTransition, type KeyboardEvent } from 'react';
import { useRouter } from 'next/navigation';
import { cx } from '@/lib/cx';
import { initials, type Persona, type PersonaGroup } from '@/lib/demo/personas';
import { clearLangChoice, useT } from '@/lib/i18n/client';
import type { MessageKey } from '@/lib/i18n';
import { Icon } from '@/components/ui/Icon';
import { Spinner } from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';

/** Who is shown when the viewer is not one of the role-bar personas (e.g. a buddy the solver picked). */
export type ViewerBadge = { name: string; roleKey: MessageKey };

const GROUPS: readonly PersonaGroup[] = ['team', 'parents', 'buddies', 'room'];

/** Switch to a persona (or any person of the sandbox) and open a page as them. Shared with the demo guide. */
export function useSwitchPersona(current: string | null) {
  const router = useRouter();
  const toast = useToast();
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const go = (target: { value: string; name: string }, href: string) => {
    startTransition(async () => {
      if (target.value !== current) {
        const res = await fetch('/api/sandbox/as', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ personId: target.value }),
        }).catch(() => null);
        if (!res?.ok) {
          toast(t('guide.switchFailed', { name: target.name }));
          return;
        }
        clearLangChoice();
      }
      startTransition(() => {
        router.push(href);
        router.refresh();
      });
    });
  };
  return { go, isPending };
}

function Avatar({ name, strong, size = 28 }: { name: string; strong?: boolean; size?: 28 | 32 }) {
  return (
    <span
      aria-hidden
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-pill text-13 font-semibold leading-none',
        size === 32 ? 'size-8' : 'size-7',
        strong ? 'bg-ink text-surface' : 'border border-hairline-strong bg-surface-2 text-ink-2',
      )}
    >
      {initials(name)}
    </span>
  );
}

type Props = { personas: Persona[]; current: string | null; viewer?: ViewerBadge | null };

export function RoleBar({ personas, current, viewer }: Props) {
  const t = useT();
  const { go, isPending } = useSwitchPersona(current);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const menuId = useId();

  const active = personas.find((p) => p.value === current) ?? null;
  const name = active?.name ?? viewer?.name ?? '';
  const role = active ? t(`persona.${active.key}`) : viewer ? t(viewer.roleKey) : '';
  const ordered = GROUPS.flatMap((g) => personas.filter((p) => p.group === g));

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    // Escape closes the menu wherever focus is (the items handle it themselves and refocus the button).
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const focusItem = (i: number) => {
    const n = ordered.length;
    itemRefs.current[((i % n) + n) % n]?.focus();
  };
  const openMenu = (focus: 'current' | 'first' | 'last' | null) => {
    setOpen(true);
    if (focus === null) return;
    requestAnimationFrame(() => {
      const idx = focus === 'last' ? ordered.length - 1 : focus === 'first' ? 0 : Math.max(0, ordered.findIndex((p) => p.value === current));
      focusItem(idx);
    });
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  const onButtonKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openMenu(e.key === 'ArrowDown' ? 'first' : 'current');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      openMenu('last');
    }
  };
  const onItemKey = (e: KeyboardEvent, i: number) => {
    const moves: Record<string, number> = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: ordered.length - 1 };
    if (e.key in moves) {
      e.preventDefault();
      focusItem(moves[e.key]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      close(true);
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };
  const pick = (p: Persona) => {
    close(true);
    if (p.value !== current) go(p, p.href);
  };

  if (personas.length === 0) return null;

  return (
    <div ref={rootRef} className="relative flex items-center gap-3">
      <span className="hidden text-13 text-ink-muted xl:inline">{t('role.viewingAs')}</span>
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={t('role.switch', { name: role ? `${name}, ${role}` : name })}
        onClick={() => (open ? close(false) : openMenu(null))}
        onKeyDown={onButtonKey}
        className={cx(
          'flex h-11 items-center gap-2.5 rounded-pill border bg-surface py-1.5 pr-3 pl-1.5 text-left',
          'transition-[border-color] duration-200 ease-out',
          open ? 'border-hairline-emphasis' : 'border-hairline-strong hover:border-hairline-emphasis',
        )}
      >
        <Avatar name={name} strong size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-15 leading-[18px] font-medium text-ink">{name}</span>
          <span className="hidden truncate text-13 leading-4 text-ink-muted sm:block">{role}</span>
        </span>
        {isPending ? <Spinner size={14} className="ml-0.5 text-ink-muted" /> : <Icon name="chevronDown" className="ml-0.5 text-ink-muted" />}
      </button>

      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label={t('role.menu')}
          className="absolute top-[calc(100%+8px)] right-0 z-50 w-[min(320px,calc(100vw-32px))] animate-rise rounded-sharp border border-hairline-strong bg-surface py-1.5"
        >
          {GROUPS.map((g) => {
            const members = personas.filter((p) => p.group === g);
            if (members.length === 0) return null;
            return (
              <div key={g} role="group" aria-labelledby={`${menuId}-${g}`} className="border-hairline not-first:mt-1.5 not-first:border-t not-first:pt-1.5">
                <p id={`${menuId}-${g}`} className="px-4 pt-1.5 pb-1 text-13 text-ink-muted">
                  {t(`role.group.${g}`)}
                </p>
                {members.map((p) => {
                  const i = ordered.indexOf(p);
                  const checked = p.value === current;
                  return (
                    <button
                      key={p.value}
                      ref={(el) => {
                        itemRefs.current[i] = el;
                      }}
                      type="button"
                      role="menuitemradio"
                      aria-checked={checked}
                      tabIndex={-1}
                      onClick={() => pick(p)}
                      onKeyDown={(e) => onItemKey(e, i)}
                      className={cx(
                        'flex h-11 w-full items-center gap-3 px-4 text-left outline-offset-[-2px]',
                        'hover:bg-ground focus:bg-ground',
                        checked && 'bg-surface-2',
                      )}
                    >
                      <Avatar name={p.name} strong={checked} />
                      <span className="min-w-0 flex-1 truncate text-15">
                        <span className="font-medium text-ink">{p.name}</span>
                        <span className="text-ink-muted"> · {t(`persona.${p.key}`)}</span>
                      </span>
                      {checked && <Icon name="check" className="text-ink" label={t('role.current')} />}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
