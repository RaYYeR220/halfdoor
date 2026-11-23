import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

// Repos only need the query-builder surface, so postgres-js (prod) and PGlite (tests) both fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let current: Db | null = null;

/** Lazy: the transaction pooler (Supavisor) needs `prepare: false`. */
export function getDb(): Db {
  if (!current) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    current = drizzle(postgres(url, { prepare: false, max: 5 }), { schema }) as unknown as Db;
  }
  return current;
}

export function setDbForTests(db: Db): void {
  current = db;
}
