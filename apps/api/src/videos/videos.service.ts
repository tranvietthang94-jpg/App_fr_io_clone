import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Video, VideoReviewStatus } from './video.entity';
import { Folder } from './folder.entity';
import { ProjectsService } from '../projects/projects.service';
import { MemberRole } from '../projects/project-member.entity';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityType } from '../activity/activity-log.entity';

const TRASH_RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS || '30', 10);

@Injectable()
export class VideosService {
  private readonly logger = new Logger(VideosService.name);

  constructor(
    @InjectRepository(Video)
    private videosRepository: Repository<Video>,
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    private projectsService: ProjectsService,
    private activityLogService: ActivityLogService,
  ) {}

  /**
   * Latest (highest versionNumber), non-deleted video per asset, optionally
   * scoped to a folder. When `opts.search` is given, folder scoping is
   * dropped so the search spans the whole project (matching Frame.io's
   * cross-folder search UX).
   */
  async findByProject(
    projectId: string,
    folderId?: string | null,
    opts: { search?: string; reviewStatus?: string } = {},
  ) {
    const qb = this.videosRepository
      .createQueryBuilder('video')
      .where('video.projectId = :projectId', { projectId })
      .andWhere('video.deletedAt IS NULL')
      .andWhere(
        `video."versionNumber" = (
          SELECT MAX(v2."versionNumber") FROM videos v2
          WHERE v2."assetGroupId" = video."assetGroupId" AND v2."deletedAt" IS NULL
        )`,
      )
      .orderBy('video.createdAt', 'DESC');

    if (opts.search) {
      qb.andWhere('video.title ILIKE :search', { search: `%${opts.search}%` });
    } else if (folderId === null || folderId === undefined) {
      qb.andWhere('video.folderId IS NULL');
    } else {
      qb.andWhere('video.folderId = :folderId', { folderId });
    }

    if (opts.reviewStatus) {
      qb.andWhere('video.reviewStatus = :reviewStatus', { reviewStatus: opts.reviewStatus });
    }

    return qb.getMany();
  }

  async findTrash(projectId: string) {
    await this.purgeExpiredTrash(projectId);
    return this.videosRepository
      .createQueryBuilder('video')
      .where('video.projectId = :projectId', { projectId })
      .andWhere('video.deletedAt IS NOT NULL')
      .orderBy('video.deletedAt', 'DESC')
      .getMany();
  }

  private async purgeExpiredTrash(projectId: string) {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const expired = await this.videosRepository
      .createQueryBuilder('video')
      .where('video.projectId = :projectId', { projectId })
      .andWhere('video.deletedAt IS NOT NULL')
      .andWhere('video.deletedAt < :cutoff', { cutoff })
      .getMany();
    if (expired.length > 0) {
      // Free the disk BEFORE dropping the DB rows — if we removed rows first
      // and the process died, the file paths would be lost and the mp4s would
      // leak forever.
      for (const video of expired) {
        await this.removeFilesFromDisk(video);
      }
      await this.videosRepository.remove(expired);
    }
  }

  /**
   * Best-effort removal of every on-disk artifact tied to a single video
   * version: the uploaded original, its transcoded-quality directory, and its
   * thumbnail. Layout must match how MediaService/UploadService write them.
   * A missing file is not an error (idempotent re-runs, partial transcodes) —
   * we log and continue so a stray file never blocks the DB cleanup.
   */
  private async removeFilesFromDisk(video: Video): Promise<void> {
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

  async findOne(id: string) {
    const video = await this.videosRepository.findOne({ where: { id } });
    if (!video) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }

  /**
   * Same as findOne, but also verifies the requesting user is a member of
   * the video's project, and that the video hasn't been trashed (a
   * soft-deleted video must be restored before it can be viewed/commented on).
   */
  async findOwned(id: string, userId: string) {
    const video = await this.findOne(id);
    await this.projectsService.findOne(video.projectId, userId);
    if (video.deletedAt) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }

  private async assertEditorAccess(video: Video, userId: string): Promise<void> {
    await this.projectsService.assertRole(video.projectId, userId, MemberRole.EDITOR);
  }

  async create(data: {
    projectId: string;
    title: string;
    originalFilename: string;
    filePath: string;
    fileSize: number;
    folderId?: string | null;
    assetGroupId?: string;
    versionNumber?: number;
    versionLabel?: string;
    uploadedBy?: { userId: string; actorName: string };
  }) {
    const { uploadedBy, ...videoData } = data;
    const video = this.videosRepository.create({
      ...videoData,
      assetGroupId: data.assetGroupId || randomUUID(),
      versionNumber: data.versionNumber || 1,
    });
    const saved = await this.videosRepository.save(video);
    if (uploadedBy) {
      await this.activityLogService.record(
        data.projectId,
        ActivityType.VIDEO_UPLOADED,
        uploadedBy.userId,
        uploadedBy.actorName,
        { videoTitle: saved.title },
        saved.id,
      );
    }
    return saved;
  }

  /** Highest-versionNumber row in the asset group, regardless of deletedAt — used to seed the next version's folder placement. */
  async getLatestVersion(assetGroupId: string): Promise<Video | null> {
    return this.videosRepository.findOne({
      where: { assetGroupId },
      order: { versionNumber: 'DESC' },
    });
  }

  async getVersions(assetGroupId: string, userId: string) {
    const versions = await this.videosRepository.find({
      where: { assetGroupId, deletedAt: IsNull() },
      order: { versionNumber: 'ASC' },
    });
    if (versions.length > 0) {
      await this.projectsService.findOne(versions[0].projectId, userId);
    }
    return versions;
  }

  async updateStatus(id: string, status: string, metadata?: {
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
  }) {
    const video = await this.findOne(id);
    video.status = status;
    if (metadata) {
      Object.assign(video, metadata);
    }
    return this.videosRepository.save(video);
  }

  /** REVIEWER is the lowest project rank, so every accepted member can set review status. */
  async setReviewStatus(id: string, status: VideoReviewStatus, userId: string, actorName: string) {
    const video = await this.findOne(id);
    await this.projectsService.assertRole(video.projectId, userId, MemberRole.REVIEWER);
    return this.applyReviewStatus(video, status, userId, actorName);
  }

  /** Used only by the guest share-link route — guests have no ProjectMember row to check. */
  async setReviewStatusAsGuest(id: string, status: VideoReviewStatus, actorName: string) {
    const video = await this.findOne(id);
    return this.applyReviewStatus(video, status, null, actorName);
  }

  private async applyReviewStatus(video: Video, status: VideoReviewStatus, updatedBy: string | null, actorName: string) {
    const oldStatus = video.reviewStatus;
    video.reviewStatus = status;
    video.reviewStatusUpdatedBy = updatedBy;
    video.reviewStatusUpdatedAt = new Date();
    const saved = await this.videosRepository.save(video);
    await this.activityLogService.record(
      video.projectId,
      ActivityType.REVIEW_STATUS_CHANGED,
      updatedBy,
      actorName,
      { oldStatus, newStatus: status },
      video.id,
    );
    return saved;
  }

  /** Lazily generates and persists a stable id for the PDF export permalink. */
  async ensurePrintUuid(id: string): Promise<string> {
    const video = await this.findOne(id);
    if (video.printUuid) {
      return video.printUuid;
    }
    video.printUuid = randomUUID();
    await this.videosRepository.save(video);
    return video.printUuid;
  }

  async rename(id: string, title: string, userId: string) {
    const video = await this.findOne(id);
    await this.assertEditorAccess(video, userId);
    video.title = title;
    return this.videosRepository.save(video);
  }

  async move(id: string, folderId: string | null, userId: string) {
    const video = await this.findOne(id);
    await this.assertEditorAccess(video, userId);
    if (folderId) {
      const folder = await this.foldersRepository.findOne({ where: { id: folderId } });
      if (!folder || folder.projectId !== video.projectId) {
        throw new NotFoundException('Folder not found');
      }
    }
    video.folderId = folderId;
    return this.videosRepository.save(video);
  }

  async softDelete(id: string, userId: string) {
    const video = await this.findOne(id);
    await this.assertEditorAccess(video, userId);
    video.deletedAt = new Date();
    await this.videosRepository.save(video);
    return { success: true };
  }

  async restore(id: string, userId: string) {
    const video = await this.findOne(id);
    await this.assertEditorAccess(video, userId);
    if (!video.deletedAt) {
      throw new ForbiddenException('Video is not in trash');
    }
    video.deletedAt = null;
    await this.videosRepository.save(video);
    return video;
  }

  /** Permanent delete — used only for legacy hard-delete call sites (e.g. project cascade already handles bulk cleanup). */
  async delete(id: string) {
    const video = await this.findOne(id);
    await this.removeFilesFromDisk(video);
    await this.videosRepository.remove(video);
    return { success: true };
  }
}
