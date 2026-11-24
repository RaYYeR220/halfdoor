// Plain data the buddy phone, room view and station pass from server pages and routes to client components.

/** The card's state as a matched buddy may know it: `ready` = reviewed by the kids' team; never its content. */
export type BuddyCardState = 'ready' | 'waiting' | 'none';

export type BuddyChild = { id: string; firstName: string; grade: string | null; card: BuddyCardState };

export type LiveService = { id: string; label: string; startsAt: string; endsAt: string; room: string | null };

/** One of today's services where the buddy has approved matches, with those children. */
export type BuddyService = LiveService & { children: BuddyChild[] };

/** GET /api/buddy/today's answer. */
export type BuddyToday = { services: BuddyService[] };

/** One logged moment as the buddy's phone lists it (this buddy, this child, this service). */
export type MomentRow = { id: string; stepKey: string; kind: 'good' | 'hard' | 'break' | 'bathroom' | 'note'; helpedItemIds: string[]; note: string | null; at: string };

/** A child of the church as the room view and the station name them. */
export type ChildName = { id: string; firstName: string; grade: string | null };

/** The station's view of one service: who is in now and since when (latest row per child). */
export type StationRow = { childId: string; in: boolean; securityCode: string | null; checkedInAt: string; checkedOutAt: string | null };
