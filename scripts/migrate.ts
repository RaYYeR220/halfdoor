import { readMigrationFiles } from 'drizzle-orm/migrator';
import postgres from 'postgres';

// The app role owns schema `halfdoor` but has no CREATE on the database, and drizzle's stock migrator
// always runs CREATE SCHEMA IF NOT EXISTS. So apply the generated files ourselves, keeping drizzle's
// journal table (halfdoor.__drizzle_migrations) format.
async function main() {
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error('DATABASE_URL is not set');
  const url = new URL(raw);
  url.port = '5432'; // session mode: DDL does not belong on the transaction pooler
  const sql = postgres(url.toString(), { max: 1, prepare: false });
  try {
    const migrations = readMigrationFiles({ migrationsFolder: './drizzle' });
    await sql`create table if not exists halfdoor.__drizzle_migrations (id serial primary key, hash text not null, created_at bigint)`;
    const [last] = await sql<{ created_at: string }[]>`select created_at from halfdoor.__drizzle_migrations order by created_at desc limit 1`;
    const lastAt = last ? Number(last.created_at) : -1;
    await sql.begin(async (tx) => {
      for (const m of migrations) {
        if (m.folderMillis <= lastAt) continue;
        // drizzle-kit qualifies FK targets with "public"; here tables live in the role search_path schema.
        for (const stmt of m.sql) await tx.unsafe(stmt.replaceAll('"public".', ''));
        await tx`insert into halfdoor.__drizzle_migrations (hash, created_at) values (${m.hash}, ${m.folderMillis})`;
      }
    });
    const [row] = await sql`select count(*)::int as n from information_schema.tables where table_schema = 'halfdoor' and table_type = 'BASE TABLE'`;
    console.log(`migrated; base tables in schema halfdoor (incl. journal): ${row.n}`);
  } finally {
    await sql.end();
  }
}

main().catch((err) => {
  console.error('migration failed:', err instanceof Error ? err.message : 'unknown error');
  process.exit(1);
});
