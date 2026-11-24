'use client';
// The live pages' pulse: GET /api/heartbeat for one service every 8 s. One request at a time (the next is scheduled
// only after the last answer, 8 s after the last one started), nothing while the tab is hidden, and an immediate
// check when it comes back.
import { useEffect, useEffectEvent, useState } from 'react';
import type { Heartbeat } from '@/lib/checkins/types';

export const BEAT_MS = 8000;
const MIN_GAP_MS = 1000;
/** Focus events come in bursts (a click into the window); one early check per this many ms is enough. */
const WAKE_GAP_MS = 1500;

export type BeatStatus = 'connecting' | 'live' | 'retrying' | 'paused';

type Pulse = { service: string | null; status: BeatStatus; lastAt: number | null; count: number };

export function useHeartbeat(serviceId: string | null, onBeat: (hb: Heartbeat) => void) {
  const [pulse, setPulse] = useState<Pulse>({ service: serviceId, status: 'connecting', lastAt: null, count: 0 });
  const deliver = useEffectEvent((hb: Heartbeat) => onBeat(hb));

  useEffect(() => {
    if (!serviceId) return;
    let alive = true;
    let inflight = false;
    let lastStart = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ctrl = new AbortController();
    const visible = () => document.visibilityState === 'visible';
    const set = (patch: Pick<Pulse, 'status'>) =>
      setPulse((p) => (p.service === serviceId ? { ...p, ...patch } : { service: serviceId, lastAt: null, count: 0, ...patch }));

    // 8 s from the start of the last check, so a slow answer doesn't stretch the cadence; at least a second's
    // breather after a check that took longer than that.
    const schedule = () => {
      clearTimeout(timer);
      if (alive && visible()) timer = setTimeout(tick, Math.max(MIN_GAP_MS, BEAT_MS - (Date.now() - lastStart)));
    };
    const tick = async () => {
      if (!alive || inflight) return;
      clearTimeout(timer);
      if (!visible()) {
        set({ status: 'paused' });
        return;
      }
      inflight = true;
      lastStart = Date.now();
      try {
        const res = await fetch(`/api/heartbeat?service=${encodeURIComponent(serviceId)}`, { cache: 'no-store', signal: ctrl.signal });
        if (!res.ok) throw new Error(String(res.status));
        const hb = (await res.json()) as Heartbeat;
        if (!alive) return;
        deliver(hb);
        setPulse((p) => ({ service: serviceId, status: 'live', lastAt: Date.now(), count: (p.service === serviceId ? p.count : 0) + 1 }));
      } catch {
        if (alive) set({ status: 'retrying' });
      } finally {
        inflight = false;
        schedule();
      }
    };
    const wake = () => {
      if (!visible()) {
        clearTimeout(timer);
        set({ status: 'paused' });
        return;
      }
      if (!inflight && Date.now() - lastStart > WAKE_GAP_MS) void tick();
    };

    document.addEventListener('visibilitychange', wake);
    window.addEventListener('focus', wake);
    void tick();
    return () => {
      alive = false;
      clearTimeout(timer);
      ctrl.abort();
      document.removeEventListener('visibilitychange', wake);
      window.removeEventListener('focus', wake);
    };
  }, [serviceId]);

  const current = pulse.service === serviceId ? pulse : { service: serviceId, status: 'connecting' as const, lastAt: null, count: 0 };
  return { status: current.status, lastAt: current.lastAt, count: current.count };
}
