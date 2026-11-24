'use client';
// Which enclave call the page's pipelines use. Normally none is provided and they use the real enclaveChat; only
// when the server passed recorded outputs (the end-to-end test seam, never in production) do they get the replay.
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { EnclaveChat } from '@/lib/venice/enclaveClient';
import { fixtureChat, type EnclaveReplay } from '@/lib/venice/fixtureChat';

const ChatContext = createContext<EnclaveChat | undefined>(undefined);

export function EnclaveFixtureProvider({ replay, children }: { replay: EnclaveReplay | null; children: ReactNode }) {
  const chat = useMemo(() => (replay ? fixtureChat(replay) : undefined), [replay]);
  return <ChatContext value={chat}>{children}</ChatContext>;
}

/** undefined = the real enclave (the pipelines' default). */
export const useEnclaveChat = (): EnclaveChat | undefined => useContext(ChatContext);
