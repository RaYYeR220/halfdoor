// The parent's words, kept in this browser's localStorage per child so a reload or a failed draft loses
// nothing. Every access is wrapped: private windows and blocked storage just mean nothing is remembered.
const PREFIX = 'hd.story.v1.';
const listeners = new Set<() => void>();

const key = (childId: string) => `${PREFIX}${childId}`;

export function readStory(childId: string): string {
  try {
    return window.localStorage.getItem(key(childId)) ?? '';
  } catch {
    return '';
  }
}

export function writeStory(childId: string, text: string): void {
  try {
    if (text.trim()) window.localStorage.setItem(key(childId), text);
    else window.localStorage.removeItem(key(childId));
  } catch {
    // storage blocked or full: the words stay on the page
  }
  listeners.forEach((l) => l());
}

export const clearStory = (childId: string) => writeStory(childId, '');

/** For useSyncExternalStore: re-read when this tab writes or another tab changes storage. */
export function subscribeStory(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (!e.key || e.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', onStorage);
  };
}
