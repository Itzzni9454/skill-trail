/**
 * Minimal .env loader — no dependency.
 *
 * Loads `<repo>/.env` if present. Real environment variables always win, so you
 * can override in production without touching the file. Never commit .env.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function loadEnv() {
  const file = path.join(ROOT, '.env');
  if (!fs.existsSync(file)) return false;
  // Split on /\r?\n/ so CRLF files (Windows) parse. Note `.` in a JS regex does
  // NOT match \r, so leaving the trailing CR in place makes every line fail.
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*([^\r\n]*)$/);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].trim().replace(/^['"]|['"]$/g, '');
  }
  return true;
}
