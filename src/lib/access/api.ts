// SERVER-ONLY helpers shared by the card/check-in routes. Errors are codes only: no card data, ever.
import { NextResponse } from 'next/server';
import { getPersonInChurch, listHouseholdLinks, type Person } from '@/db/repo/people';
import type { Role } from '@/lib/auth/tokens';
import { getViewer, type Viewer } from '@/lib/auth/viewer';

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const fail = (error: string, status: number) => NextResponse.json({ error }, { status });

/** 401 without a viewer, 403 when the role is not allowed. */
export async function requireViewer(roles?: readonly Role[]): Promise<Viewer | NextResponse> {
  const viewer = await getViewer();
  if (!viewer) return fail('unauthorized', 401);
  if (roles && !roles.includes(viewer.role)) return fail('forbidden', 403);
  return viewer;
}

/** The child, only if it is a child of the viewer's church. */
export async function childInChurch(viewer: Viewer, childId: string): Promise<Person | null> {
  if (!UUID.test(childId)) return null;
  const p = await getPersonInChurch(viewer.churchId, childId);
  return p && p.role === 'child' ? p : null;
}

export async function isParentOf(viewer: Viewer, childId: string): Promise<boolean> {
  return (await listHouseholdLinks([childId])).some((l) => l.parentId === viewer.personId);
}

export async function readJson(req: Request): Promise<Record<string, unknown> | null> {
  const body = await req.json().catch(() => null);
  return body && typeof body === 'object' && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
}
