import * as fs from 'fs';
import * as path from 'path';
import { DataSource } from 'typeorm';
import { newestMtimeMs, reservationTtlMs } from './upload-sessions';

/** Quota held by non-expired upload sessions, per user. */
function liveReservations(chunksDir: string, now: number): Map<string, number> {
  const held = new Map<string, number>();
  if (!fs.existsSync(chunksDir)) return held;
  const ttl = reservationTtlMs();
  for (const id of fs.readdirSync(chunksDir)) {
    const dir = path.join(chunksDir, id);
    try {
      if (now - newestMtimeMs(dir) > ttl) continue;
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'metadata.json'), 'utf-8'));
      if (meta.userId && meta.reservedBytes > 0) held.set(meta.userId, (held.get(meta.userId) ?? 0) + meta.reservedBytes);
    } catch {
      // unreadable/half-written session: it holds nothing we can attribute
    }
  }
  return held;
}

/**
 * Repairs counter drift. Idempotent. Everything runs in one transaction.
 *  1. videos.uploadedById IS NULL <- actor of the earliest 'video_uploaded' log, else the project owner.
 *  2. users.storageUsed = SUM(fileSize of the user's videos, trashed included) + live reservations.
 */
export async function recalculateStorage(
  ds: Pick<DataSource, 'transaction'>,
  opts: { now?: number; uploadsRoot?: string } = {},
): Promise<{ backfilled: number; users: number }> {
  const now = opts.now ?? Date.now();
  const reserved = liveReservations(path.join(opts.uploadsRoot ?? path.join(process.cwd(), 'uploads'), 'chunks'), now);

  return ds.transaction(async (m) => {
    // pg driver: UPDATE resolves to [rows, affectedCount].
    // Joins to users so an actor/owner that no longer exists cannot violate the FK.
    const [, fromLog]: [unknown, number] = await m.query(`
      UPDATE videos v SET "uploadedById" = (
        SELECT u.id FROM activity_logs a JOIN users u ON u.id::text = a."actorId"
        WHERE a.type = 'video_uploaded' AND a."videoId" = v.id::text
        ORDER BY a."createdAt" ASC LIMIT 1)
      WHERE v."uploadedById" IS NULL
        AND EXISTS (SELECT 1 FROM activity_logs a JOIN users u ON u.id::text = a."actorId"
                    WHERE a.type = 'video_uploaded' AND a."videoId" = v.id::text)`);
    const [, fromOwner]: [unknown, number] = await m.query(`
      UPDATE videos v SET "uploadedById" = u.id
      FROM projects p JOIN users u ON u.id = p."ownerId"
      WHERE p.id = v."projectId" AND v."uploadedById" IS NULL`);

    const [, users]: [unknown, number] = await m.query(`
      UPDATE users u SET "storageUsed" = COALESCE(
        (SELECT SUM(v."fileSize") FROM videos v WHERE v."uploadedById" = u.id), 0)`);
    for (const [userId, bytes] of reserved) {
      await m.query(`UPDATE users SET "storageUsed" = "storageUsed" + $1 WHERE id = $2`, [bytes, userId]);
    }
    return { backfilled: fromLog + fromOwner, users };
  });
}
