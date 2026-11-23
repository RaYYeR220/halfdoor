import { afterEach, describe, expect, it, vi } from 'vitest';
import { en } from '@/lib/i18n/en';
import { es } from '@/lib/i18n/es';
import { DICTIONARIES, isLocalizedPath, langForPath, resolveLang, t, type MessageKey } from '@/lib/i18n';

const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

afterEach(() => vi.unstubAllEnvs());

describe('dictionaries', () => {
  it('EN and ES have exactly the same keys', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort());
  });

  it('no empty strings, no untranslated copies of long English lines', () => {
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dict)) expect(value.trim(), `${lang}:${key}`).not.toBe('');
    }
    const same = (Object.keys(en) as MessageKey[]).filter((k) => en[k] === es[k] && en[k].length > 12);
    expect(same).toEqual([]);
  });

  it('every ES string uses the same {variables} as EN', () => {
    for (const key of Object.keys(en) as MessageKey[]) expect(vars(es[key]), key).toEqual(vars(en[key]));
  });

  it('no AI-authorship cliché and no overclaiming in shell copy', () => {
    const all = [...Object.values(en), ...Object.values(es)].join('\n').toLowerCase();
    for (const banned of ['ai drafts', 'a person approves', 'proven', 'no one can read', 'nadie puede leer', 'garantiza']) {
      expect(all).not.toContain(banned);
    }
  });
});

describe('t()', () => {
  it('interpolates variables', () => {
    expect(t('en', 'guide.progress', { done: 2, total: 7 })).toBe('2 of 7 done');
    expect(t('es', 'guide.progress', { done: 2, total: 7 })).toBe('2 de 7 hechos');
    expect(t('es', 'guide.title')).toBe('Pruebe un domingo');
  });

  it('throws on a missing key or variable outside production', () => {
    expect(() => t('es', 'guide.nope' as MessageKey)).toThrow(/missing "guide.nope"/);
    expect(() => t('en', 'guide.progress', { done: 1 })).toThrow(/needs \{total\}/);
  });

  it('falls back to English, then the key, in production', () => {
    vi.stubEnv('NODE_ENV', 'production');
    const dict = DICTIONARIES.es as Record<string, string>;
    const saved = dict['guide.title'];
    delete dict['guide.title'];
    try {
      expect(t('es', 'guide.title')).toBe('Try a Sunday');
    } finally {
      dict['guide.title'] = saved;
    }
    expect(t('en', 'guide.nope' as MessageKey)).toBe('guide.nope');
    expect(t('en', 'guide.progress', { done: 1 })).toBe('1 of {total} done');
  });
});

describe('language rules', () => {
  it('the switch wins, then the person, then English', () => {
    expect(resolveLang('es', 'en')).toBe('es');
    expect(resolveLang('en', 'es')).toBe('en');
    expect(resolveLang(undefined, 'es')).toBe('es');
    expect(resolveLang('fr', null)).toBe('en');
  });

  it('parent, buddy and room pages are localized; the desk is English', () => {
    expect(isLocalizedPath('/c/fernbrook-ab12/parent/123')).toBe(true);
    expect(isLocalizedPath('/c/fernbrook-ab12/buddy/123')).toBe(true);
    expect(isLocalizedPath('/c/fernbrook-ab12/room')).toBe(true);
    expect(isLocalizedPath('/c/fernbrook-ab12/desk')).toBe(false);
    expect(langForPath('/c/fernbrook-ab12/desk', 'es')).toBe('en');
    expect(langForPath('/c/fernbrook-ab12/parent/1', 'es')).toBe('es');
  });
});
