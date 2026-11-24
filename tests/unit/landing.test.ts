import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';
import { Faq } from '@/components/landing/Faq';
import { Footer } from '@/components/landing/Footer';
import { CARD_VALUES, LINES, MARIA } from '@/components/landing/heroField';
import { Measured } from '@/components/landing/Measured';
import { HowItWorks } from '@/components/landing/HowItWorks';
import { Nav } from '@/components/landing/Nav';
import { PlanningCenter } from '@/components/landing/PlanningCenter';
import { Privacy } from '@/components/landing/Privacy';
import { ENCLAVE_COPY, HONEST_LIMITS } from '@/lib/crypto/attestation';

const html = (el: Parameters<typeof renderToStaticMarkup>[0]) =>
  renderToStaticMarkup(el).replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ');

describe('landing', () => {
  test('the source code link shows only when the repo URL is set', () => {
    expect(renderToStaticMarkup(createElement(Nav, { repoUrl: null }))).not.toContain('Source code');
    expect(renderToStaticMarkup(createElement(Nav, { repoUrl: 'https://github.com/x/halfdoor' }))).toContain(
      '<a href="https://github.com/x/halfdoor">Source code</a>',
    );
    expect(renderToStaticMarkup(createElement(Footer, { repoUrl: null }))).not.toContain('Source code');
  });

  test('the demo links are plain anchors (the route makes a sandbox; never prefetched)', () => {
    const nav = renderToStaticMarkup(createElement(Nav, { repoUrl: null }));
    expect(nav).toContain('<a class="btn btn-quiet" href="/demo">');
  });

  test('Measured renders the eval claims with the numbers from final.json', () => {
    const text = html(createElement(Measured, { repoUrl: null }));
    expect(text).toContain('Measured on 60 parent stories.');
    expect(text).toContain('35 in English, 25 in Spanish, each with a hidden answer key');
    expect(text).toContain('Halfdoor 157 of 157 (after the parent confirms the safety prompts). A plain AI summary kept them too: 157 of 157.');
    expect(text).toContain(
      'A prompted short card: 28 of 54 (Claude Sonnet 5.5) and 13 of 51 (same model as Halfdoor). Halfdoor: 3 of 58, and every line shows the words it came from.',
    );
    expect(text).toContain("a card's title doesn't count");
    expect(text).toContain(
      'By hand, on a random sample of short-card sentences: 13 of 15 the rule flagged really added something, and 14 of 15 it passed really came from the parent. It errs both ways, so the counts are approximate.',
    );
    expect(text).not.toMatch(/if anything, low|lean low/);
    expect(text).not.toContain('{{');
  });

  test('Privacy uses the app’s own enclave wording and never overclaims', () => {
    const text = html(createElement(Privacy));
    expect(text).toContain(ENCLAVE_COPY.short);
    expect(text).toContain(HONEST_LIMITS);
    expect(text).toContain(ENCLAVE_COPY.pccsNote);
    expect(text).not.toMatch(/proven|no one can/i);
  });

  test('Planning Center is described as built for, not connected', () => {
    const text = html(createElement(PlanningCenter));
    expect(text).toContain('Built for Planning Center');
    expect(text).toContain('The live connection is not part of this demo: a clearly labelled simulated check-in station stands in for Check-Ins.');
    expect(text).not.toMatch(/Works with|open and close the card\.|can be scheduled into/);
    expect(html(createElement(HowItWorks))).not.toContain('Planning Center Check-Ins');
  });

  test('FAQ names the models from the app constants', () => {
    expect(html(createElement(Faq))).toContain(
      "Children's words go only to an open-weight model running inside an attested enclave on Venice (currently e2ee-deepseek-v4-flash). The Sunday lesson — no child data — is restructured by Claude Sonnet 5.5 on Venice.",
    );
  });

  test('footer carries the fictional-church note and both attributions', () => {
    const text = html(createElement(Footer, { repoUrl: null }));
    expect(text).toContain('Fernbrook Community Church is a fictional demo church with sample data.');
    expect(text).toContain('Pictograms: Sergio Palao. Origin: ARASAAC (https://arasaac.org). License: CC BY-NC-SA. Owner: Government of Aragón (Spain).');
    expect(text).toContain('Berean Standard Bible (BSB), public domain.');
    expect(text).toContain('Built for the AI for Church Hackathon 2026.');
  });

  test('every card line is Maria’s words: quotes are in her paragraph, word-for-word lines are her sentences', () => {
    for (const [quote, value] of LINES) {
      expect(MARIA).toContain(quote);
      if (value === null) expect(CARD_VALUES).toContain(quote);
    }
  });
});
