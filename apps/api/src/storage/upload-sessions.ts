import * as fs from 'fs';
import * as path from 'path';

/** How long an idle upload session keeps its quota reserved. */
export function reservationTtlMs(): number {
  const n = parseInt(process.env.UPLOAD_RESERVATION_TTL_MS ?? '', 10);
  return Number.isNaN(n) ? 24 * 60 * 60 * 1000 : n;
}

/** Newest mtime of any file in a chunk dir (metadata.json or a chunk); the dir's own mtime when empty. */
export function newestMtimeMs(dir: string): number {
  const mtimes = fs.readdirSync(dir).map((f) => fs.statSync(path.join(dir, f)).mtimeMs);
  return mtimes.length ? Math.max(...mtimes) : fs.statSync(dir).mtimeMs;
}
