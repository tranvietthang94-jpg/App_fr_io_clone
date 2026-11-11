import { HttpException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import { DataSource, EntityManager } from 'typeorm';
import { User } from '../auth/user.entity';
import { Video } from '../videos/video.entity';
import { isSuperAdminId } from '../admin/admin-permissions';
import { formatBytes } from './format-bytes';

const DEFAULT_QUOTA_BYTES = 16106127360; // 15 GiB

export class QuotaExceededException extends HttpException {
  constructor(free: number, need: number) {
    super(`Còn trống ${formatBytes(free)}, file cần ${formatBytes(need)} — liên hệ admin để nâng dung lượng`, 413);
  }
}

@Injectable()
export class StorageService {
  private readonly logger = new Logger(StorageService.name);

  constructor(private readonly dataSource: DataSource) {}

  defaultQuota(): number {
    const n = Number(process.env.DEFAULT_STORAGE_QUOTA_BYTES);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_QUOTA_BYTES;
  }

  /** null = unlimited (super admin). */
  effectiveQuota(user: Pick<User, 'id' | 'storageQuota'>): number | null {
    if (isSuperAdminId(user.id)) return null;
    return user.storageQuota ?? this.defaultQuota();
  }

  async charge(userId: string, bytes: number, manager?: EntityManager): Promise<void> {
    await this.chargeMany(new Map([[userId, bytes]]), manager);
  }

  /** All-or-nothing; users are locked in ascending id order so concurrent calls cannot deadlock. */
  async chargeMany(charges: Map<string, number>, manager?: EntityManager): Promise<void> {
    await this.inTx(manager, async (m) => {
      const repo = m.getRepository(User);
      const checked: { user: User; used: number }[] = [];
      for (const id of [...charges.keys()].sort()) {
        const user = await this.lock(m, id);
        const used = Number(user.storageUsed) + charges.get(id)!;
        const quota = this.effectiveQuota(user);
        if (quota !== null && used > quota) {
          throw new QuotaExceededException(Math.max(quota - Number(user.storageUsed), 0), charges.get(id)!);
        }
        checked.push({ user, used });
      }
      for (const { user, used } of checked) await repo.update(user.id, { storageUsed: used });
    });
  }

  async credit(userId: string | null, bytes: number | string, manager?: EntityManager): Promise<void> {
    const n = Number(bytes); // Video.fileSize arrives from Postgres as a string
    if (!userId || !(n > 0)) return;
    await this.inTx(manager, async (m) => {
      const user = await this.lock(m, userId);
      await m.getRepository(User).update(userId, { storageUsed: Math.max(Number(user.storageUsed) - n, 0) });
    });
  }

  /**
   * The only place video files are destroyed. Files first, then rows, then quota:
   * if the process died after dropping rows the file paths would be lost and the
   * mp4s would leak forever; a crash before the credit only over-counts (recalc repairs).
   */
  async destroyVideos(videos: Video[]): Promise<void> {
    if (videos.length === 0) return;
    for (const video of videos) await this.removeFiles(video);
    await this.dataSource.getRepository(Video).remove(videos);

    const perUser = new Map<string, number>();
    for (const v of videos) {
      if (v.uploadedById) perUser.set(v.uploadedById, (perUser.get(v.uploadedById) ?? 0) + Number(v.fileSize));
    }
    for (const [userId, bytes] of perUser) await this.credit(userId, bytes);
  }

  /**
   * Best-effort removal of every on-disk artifact of one video version: the original,
   * its transcoded-quality directory and its thumbnail. A missing file is not an error
   * (idempotent re-runs, partial transcodes) - log and continue so it never blocks DB cleanup.
   */
  private async removeFiles(video: Video): Promise<void> {
    const uploadsRoot = path.join(process.cwd(), 'uploads');
    const targets = [
      video.filePath,
      path.join(uploadsRoot, 'transcoded', video.id),
      path.join(uploadsRoot, 'thumbnails', `${video.id}.jpg`),
    ];
    for (const target of targets) {
      if (!target) continue;
      try {
        await fs.rm(target, { recursive: true, force: true });
      } catch (err) {
        this.logger.warn(`Failed to remove ${target} for video ${video.id}: ${err}`);
      }
    }
  }

  async getUsage(userId: string): Promise<{ used: number; quota: number | null }> {
    return this.inTx(undefined, async (m) => {
      const user = await m.getRepository(User).findOne({ where: { id: userId } });
      if (!user) throw new NotFoundException('User not found');
      return { used: Number(user.storageUsed), quota: this.effectiveQuota(user) };
    });
  }

  private inTx<T>(manager: EntityManager | undefined, fn: (m: EntityManager) => Promise<T>): Promise<T> {
    return manager ? fn(manager) : this.dataSource.transaction(fn);
  }

  private async lock(m: EntityManager, id: string): Promise<User> {
    const user = await m.getRepository(User).findOne({ where: { id }, lock: { mode: 'pessimistic_write' } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
