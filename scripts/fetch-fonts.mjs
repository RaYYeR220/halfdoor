// Fetches the General Sans webfonts (400/500/600) from Fontshare into src/app/fonts/ before dev and build.
// The files are self-hosted by the app through next/font/local but are not committed: the ITF Free Font
// License allows self-hosting for our own site and forbids redistributing the font files through a public
// repository. See src/app/fonts/LICENSE.txt.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'app', 'fonts');
const CSS_URL = 'https://api.fontshare.com/v2/css?f[]=general-sans@400,500,600&display=swap';
const FILES = { 400: 'GeneralSans-Regular.woff2', 500: 'GeneralSans-Medium.woff2', 600: 'GeneralSans-Semibold.woff2' };
const UA = 'Halfdoor build (+https://halfdoor.vercel.app)';

const isWoff2 = (buf) => buf.length > 1024 && buf.subarray(0, 4).toString('latin1') === 'wOF2';
const have = (name) => existsSync(join(DIR, name)) && isWoff2(readFileSync(join(DIR, name)));

async function main() {
  const missing = Object.entries(FILES).filter(([, name]) => !have(name));
  if (missing.length === 0) return;
  mkdirSync(DIR, { recursive: true });

  const css = await (await fetch(CSS_URL, { headers: { 'user-agent': UA } })).text();
  const urls = {};
  for (const block of css.split('@font-face').slice(1)) {
    const weight = /font-weight:\s*(\d+)/.exec(block)?.[1];
    const woff2 = /url\('([^']+\.woff2)'\)/.exec(block)?.[1];
    if (weight && woff2) urls[weight] = woff2.startsWith('//') ? `https:${woff2}` : woff2;
  }
  for (const [weight, name] of missing) {
    const url = urls[weight];
    if (!url) throw new Error(`Fontshare CSS has no woff2 for General Sans ${weight}`);
    const res = await fetch(url, { headers: { 'user-agent': UA } });
    if (!res.ok) throw new Error(`General Sans ${weight}: HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (!isWoff2(buf)) throw new Error(`General Sans ${weight}: not a woff2 file`);
    writeFileSync(join(DIR, name), buf);
    console.log(`fonts: fetched ${name} (${buf.length} bytes)`);
  }
}

main().catch((err) => {
  console.error(`fonts: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
