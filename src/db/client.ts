import { drizzle } from 'drizzle-orm/postgres-js';
import type { PgDatabase } from 'drizzle-orm/pg-core';
import postgres from 'postgres';
import * as schema from './schema';

// Repos only need the query-builder surface, so postgres-js (prod) and PGlite (tests) both fit.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = PgDatabase<any, typeof schema>;

let current: Db | null = null;

/**
 * Lazy: the transaction pooler (Supavisor) needs `prepare: false`, and `max_pipeline: 1` (one query in flight per
 * connection). postgres.js otherwise pipelines concurrent queries on one connection, and the transaction pooler can
 * split a pipelined query across backends: one backend then waits for the rest of the message forever and the
 * query never answers (pages stream forever, or another query gets its statement timeout). Short connect/idle
 * timeouts suit serverless instances and keep a dead or stalled pooler connection from holding the pool.
 */
export function getDb(): Db {
  if (!current) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL is not set');
    current = drizzle(postgres(url, { prepare: false, max: 5, max_pipeline: 1, connect_timeout: 10, idle_timeout: 20 }), { schema }) as unknown as Db;
  }
  return current;
}

export function setDbForTests(db: Db): void {
  current = db;
}
