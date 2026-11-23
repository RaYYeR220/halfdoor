import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';

// Session mode (port 5432): DDL does not belong on the transaction pooler.
const raw = process.env.DATABASE_URL;
if (!raw) throw new Error('DATABASE_URL is not set');
const url = new URL(raw);
url.port = '5432';
const client = postgres(url.toString(), { max: 1, prepare: false });
await migrate(drizzle(client), { migrationsFolder: './drizzle', migrationsSchema: 'halfdoor' });
const [row] = await client`select count(*)::int as n from information_schema.tables where table_schema = 'halfdoor' and table_type = 'BASE TABLE'`;
console.log(`migrated; base tables in schema halfdoor: ${row.n}`);
await client.end();
