// SERVER-ONLY. The key verse, verbatim from the Bible SDK (BSB). Never model-written.
import { createScriptureClient } from '@faith-tools/bible-sdk/data';

export const BSB_ATTRIBUTION = 'Berean Standard Bible (BSB), public domain.';

const BOOKS: Record<string, string> = {
  genesis: 'GEN', exodus: 'EXO', leviticus: 'LEV', numbers: 'NUM', deuteronomy: 'DEU', joshua: 'JOS', judges: 'JDG', ruth: 'RUT',
  '1 samuel': '1SA', '2 samuel': '2SA', '1 kings': '1KI', '2 kings': '2KI', '1 chronicles': '1CH', '2 chronicles': '2CH',
  ezra: 'EZR', nehemiah: 'NEH', esther: 'EST', job: 'JOB', psalm: 'PSA', psalms: 'PSA', proverbs: 'PRO', ecclesiastes: 'ECC',
  'song of solomon': 'SNG', 'song of songs': 'SNG', isaiah: 'ISA', jeremiah: 'JER', lamentations: 'LAM', ezekiel: 'EZK',
  daniel: 'DAN', hosea: 'HOS', joel: 'JOL', amos: 'AMO', obadiah: 'OBA', jonah: 'JON', micah: 'MIC', nahum: 'NAM',
  habakkuk: 'HAB', zephaniah: 'ZEP', haggai: 'HAG', zechariah: 'ZEC', malachi: 'MAL',
  matthew: 'MAT', mark: 'MRK', luke: 'LUK', john: 'JHN', acts: 'ACT', romans: 'ROM', '1 corinthians': '1CO', '2 corinthians': '2CO',
  galatians: 'GAL', ephesians: 'EPH', philippians: 'PHP', colossians: 'COL', '1 thessalonians': '1TH', '2 thessalonians': '2TH',
  '1 timothy': '1TI', '2 timothy': '2TI', titus: 'TIT', philemon: 'PHM', hebrews: 'HEB', james: 'JAS', '1 peter': '1PE',
  '2 peter': '2PE', '1 john': '1JN', '2 john': '2JN', '3 john': '3JN', jude: 'JUD', revelation: 'REV',
};

/** "Isaiah 9:6" -> "ISA.9.6"; "John 3:16-18" -> "JHN.3.16-18". null when it is not a plain book chapter:verse reference. */
export function passageIdOf(ref: string): string | null {
  const m = /^\s*((?:[123]\s*)?[A-Za-z][A-Za-z ]*?)\s+(\d{1,3}):(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?\s*$/.exec(ref);
  if (!m) return null;
  const book = BOOKS[m[1].toLowerCase().replace(/^([123])\s*/, '$1 ').replace(/\s+/g, ' ')];
  if (!book) return null;
  return `${book}.${m[2]}.${m[3]}${m[4] ? `-${m[4]}` : ''}`;
}

type Scripture = Pick<ReturnType<typeof createScriptureClient>, 'getPassage'>;

/** null for an unknown reference or any lookup failure (callers show no verse rather than a wrong one). */
export async function getVerse(ref: string, client?: Scripture): Promise<{ ref: string; text: string; attribution: string } | null> {
  const passageId = passageIdOf(ref);
  if (!passageId) return null;
  try {
    const scripture = client ?? createScriptureClient();
    const p = await scripture.getPassage({ versionId: 'BSB', passageId });
    const text = p.text.trim();
    return text ? { ref: ref.trim(), text, attribution: BSB_ATTRIBUTION } : null;
  } catch {
    return null;
  }
}
