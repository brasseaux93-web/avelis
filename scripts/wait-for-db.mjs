import postgres from 'postgres';
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
try {
  await sql`select 1`;
  await sql.end({ timeout: 1 });
  process.exit(0);
} catch {
  try { await sql.end({ timeout: 1 }); } catch { /* ignore */ }
  process.exit(1);
}
