import fs from 'node:fs';
import postgres from 'postgres';
const file = process.argv[2];
if (!file) {
  console.error('usage: apply-sql.mjs <file.sql>');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL required');
  process.exit(1);
}
const sql = postgres(url, { max: 1 });
const text = fs.readFileSync(file, 'utf8');
try {
  await sql.unsafe(text);
  await sql.end({ timeout: 1 });
} catch (e) {
  console.error(e);
  try { await sql.end({ timeout: 1 }); } catch { /* ignore */ }
  process.exit(1);
}
