import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
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
import { StorageService } from '../storage/storage.service';
import { ProjectAction } from '../projects/project-access';
import { sanitizeFilename } from '../storage/sanitize-filename';

const TRASH_RETENTION_DAYS = parseInt(process.env.TRASH_RETENTION_DAYS || '30', 10);
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class VideosService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(VideosService.name);
  private purgeTimer?: NodeJS.Timeout;

  constructor(
    @InjectRepository(Video)
    private videosRepository: Repository<Video>,
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    private projectsService: ProjectsService,
    private activityLogService: ActivityLogService,
    private storage: StorageService,
  ) {}

  onModuleInit() {
    const run = () => this.purgeAllExpiredTrash().catch((err) => this.logger.error(`Trash purge failed: ${err}`));
    void run();
    this.purgeTimer = setInterval(run, PURGE_INTERVAL_MS);
    this.purgeTimer.unref(); // never keep the process (or tests) alive
  }

  onModuleDestroy() {
    clearInterval(this.purgeTimer);
  }

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
    await this.purgeExpired(projectId);
  }

  /** Trash retention applies to every project, so it no longer depends on someone opening the trash. */
  async purgeAllExpiredTrash(): Promise<number> {
    return this.purgeExpired();
  }

  private async purgeExpired(projectId?: string): Promise<number> {
    const cutoff = new Date(Date.now() - TRASH_RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const qb = this.videosRepository
      .createQueryBuilder('video')
      .where('video.deletedAt IS NOT NULL')
      .andWhere('video.deletedAt < :cutoff', { cutoff });
    if (projectId) qb.andWhere('video.projectId = :projectId', { projectId });
    const expired = await qb.getMany();
    await this.storage.destroyVideos(expired);
    return expired.length;
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
  async findOwned(id: string, userId: string, action: ProjectAction = ProjectAction.READ) {
    const video = await this.findOne(id);
    await this.projectsService.authorize(video.projectId, userId, action);
    if (video.deletedAt) {
      throw new NotFoundException('Video not found');
    }
    return video;
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
    uploadedById?: string;
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

  /** Every accepted member can set review status; an admin needs project_interact. */
  async setReviewStatus(id: string, status: VideoReviewStatus, userId: string, actorName: string) {
    const video = await this.findOne(id);
    await this.projectsService.authorize(video.projectId, userId, ProjectAction.INTERACT);
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
    await this.projectsService.assertRole(video.projectId, userId, MemberRole.EDITOR);
    video.title = title;
    return this.videosRepository.save(video);
  }

  async move(id: string, folderId: string | null, userId: string, actorName = '', targetProjectId?: string) {
    const video = await this.findOne(id);
    if (targetProjectId && targetProjectId !== video.projectId) {
      return this.moveAcrossProjects(video, folderId, targetProjectId, userId, actorName);
    }
    const { viaAdmin } = await this.projectsService.authorize(video.projectId, userId, ProjectAction.CONTENT);
    if (folderId) {
      const folder = await this.foldersRepository.findOne({ where: { id: folderId } });
      if (!folder || folder.projectId !== video.projectId) {
        throw new NotFoundException('Folder not found');
      }
    }
    video.folderId = folderId;
    const saved = await this.videosRepository.save(video);
    await this.recordAdminAction(viaAdmin, ActivityType.ADMIN_VIDEO_MOVED, video, userId, actorName);
    return saved;
  }

  async softDelete(id: string, userId: string, actorName = '') {
    const video = await this.findOne(id);
    const { viaAdmin } = await this.projectsService.authorize(video.projectId, userId, ProjectAction.CONTENT);
    video.deletedAt = new Date();
    await this.videosRepository.save(video);
    await this.recordAdminAction(viaAdmin, ActivityType.ADMIN_VIDEO_TRASHED, video, userId, actorName);
    return { success: true };
  }

  async restore(id: string, userId: string, actorName = '') {
    const video = await this.findOne(id);
    const { viaAdmin } = await this.projectsService.authorize(video.projectId, userId, ProjectAction.CONTENT);
    if (!video.deletedAt) {
      throw new ForbiddenException('Video is not in trash');
    }
    video.deletedAt = null;
    await this.videosRepository.save(video);
    await this.recordAdminAction(viaAdmin, ActivityType.ADMIN_VIDEO_RESTORED, video, userId, actorName);
    return video;
  }

  private async assertFolderIn(folderId: string, projectId: string) {
    const folder = await this.foldersRepository.findOne({ where: { id: folderId } });
    if (!folder || folder.projectId !== projectId) {
      throw new BadRequestException('Thư mục đích không thuộc project đích');
    }
  }

  /** Moves every version of the asset (trashed ones too) in one UPDATE; storage is unchanged. */
  private async moveAcrossProjects(video: Video, folderId: string | null, targetProjectId: string, userId: string, actorName: string) {
    const from = await this.projectsService.authorize(video.projectId, userId, ProjectAction.CONTENT);
    const to = await this.projectsService.authorize(targetProjectId, userId, ProjectAction.CONTENT);
    if (folderId) await this.assertFolderIn(folderId, targetProjectId);

    const sourceProjectId = video.projectId;
    await this.videosRepository.update({ assetGroupId: video.assetGroupId }, { projectId: targetProjectId, folderId });
    const payload = { videoTitle: video.title, fromProjectId: sourceProjectId, toProjectId: targetProjectId, viaAdmin: from.viaAdmin || to.viaAdmin };
    for (const projectId of [sourceProjectId, targetProjectId]) {
      await this.activityLogService.record(projectId, ActivityType.VIDEO_MOVED_PROJECT, userId, actorName, payload, video.id);
    }
    return { ...video, projectId: targetProjectId, folderId };
  }

  /**
   * Copies the viewed version as a brand-new asset. The ORIGINAL uploader is charged (all-or-nothing,
   * before any file is touched) and credited back if copying fails.
   */
  async copyVideo(id: string, dto: { targetProjectId: string; targetFolderId: string | null }, userId: string, actorName: string) {
    const src = await this.findOne(id);
    if (src.deletedAt) throw new NotFoundException('Video not found');
    const from = await this.projectsService.authorize(src.projectId, userId, ProjectAction.CONTENT);
    const to =
      dto.targetProjectId === src.projectId
        ? from
        : await this.projectsService.authorize(dto.targetProjectId, userId, ProjectAction.CONTENT);
    if (dto.targetFolderId) await this.assertFolderIn(dto.targetFolderId, dto.targetProjectId);
    this.assertReady(src);

    // A legacy row nobody backfilled has no uploader: charge the person copying it.
    const chargedTo = src.uploadedById ?? userId;
    const bytes = Number(src.fileSize);
    await this.storage.chargeMany(new Map([[chargedTo, bytes]]));
    let copy: Video;
    try {
      copy = await this.cloneVideo(src, { projectId: dto.targetProjectId, folderId: dto.targetFolderId, uploadedById: chargedTo });
    } catch (err) {
      await this.storage.credit(chargedTo, bytes);
      throw err;
    }
    await this.activityLogService.record(
      dto.targetProjectId,
      ActivityType.VIDEO_COPIED,
      userId,
      actorName,
      { videoTitle: copy.title, viaAdmin: from.viaAdmin || to.viaAdmin, sourceProjectId: src.projectId },
      copy.id,
    );
    return copy;
  }

  async duplicateVideo(id: string, userId: string, actorName: string) {
    const src = await this.findOne(id);
    return this.copyVideo(id, { targetProjectId: src.projectId, targetFolderId: src.folderId }, userId, actorName);
  }

  /** A transcode still running (or failed) has no complete renditions to copy. */
  assertReady(video: Video) {
    if (video.status !== 'ready') throw new ConflictException('Video chưa xử lý xong, thử lại sau');
  }

  /**
   * Physical copy + new row (new asset, version 1). On any failure the files created so far are
   * removed; the caller owns the quota charge and must credit it back.
   */
  async cloneVideo(src: Video, dest: { projectId: string; folderId: string | null; uploadedById: string }): Promise<Video> {
    const id = randomUUID();
    const uploads = path.join(process.cwd(), 'uploads');
    const created: string[] = [];
    try {
      const filePath = path.join(uploads, `${id}_${sanitizeFilename(src.originalFilename)}`);
      created.push(filePath);
      await fs.copyFile(src.filePath, filePath);
      // Renditions and thumbnail are optional (a transcode may have produced neither).
      for (const [from, to] of [
        [path.join(uploads, 'transcoded', src.id), path.join(uploads, 'transcoded', id)],
        [path.join(uploads, 'thumbnails', `${src.id}.jpg`), path.join(uploads, 'thumbnails', `${id}.jpg`)],
      ]) {
        created.push(to);
        try {
          await fs.cp(from, to, { recursive: true });
        } catch (err: any) {
          if (err?.code !== 'ENOENT') throw err;
        }
      }
      return await this.videosRepository.save(
        this.videosRepository.create({
          id,
          projectId: dest.projectId,
          folderId: dest.folderId,
          assetGroupId: randomUUID(),
          versionNumber: 1,
          title: src.title,
          originalFilename: src.originalFilename,
          filePath,
          duration: src.duration,
          width: src.width,
          height: src.height,
          fps: src.fps,
          fileSize: src.fileSize,
          status: src.status,
          uploadedById: dest.uploadedById,
        }),
      );
    } catch (err) {
      this.logger.error(`Copy of video ${src.id} failed: ${err}`);
      await Promise.all(created.map((p) => fs.rm(p, { recursive: true, force: true }).catch(() => undefined)));
      throw new InternalServerErrorException('Không sao chép được file video');
    }
  }

  /** Permanently destroys every version of the asset. confirmName is checked here, not only in the UI. */
  async deletePermanently(id: string, confirmName: string, userId: string, actorName: string) {
    const video = await this.findOne(id);
    const { viaAdmin } = await this.projectsService.authorize(video.projectId, userId, ProjectAction.CONTENT);
    if (confirmName.trim() !== video.title) throw new BadRequestException('Tên xác nhận không khớp');
    const versions = await this.videosRepository.find({ where: { assetGroupId: video.assetGroupId } });
    await this.storage.destroyVideos(versions);
    await this.activityLogService.record(
      video.projectId,
      ActivityType.VIDEO_DELETED_PERMANENTLY,
      userId,
      actorName,
      { videoTitle: video.title, versions: versions.length, viaAdmin },
    );
    return { success: true };
  }

  async getDeletePreview(id: string, userId: string) {
    const video = await this.findOne(id);
    await this.projectsService.authorize(video.projectId, userId, ProjectAction.READ);
    const versions = await this.videosRepository.find({ where: { assetGroupId: video.assetGroupId } });
    return {
      name: video.title,
      videoCount: versions.length,
      totalBytes: versions.reduce((sum, v) => sum + Number(v.fileSize), 0),
    };
  }

  /** Members' own actions are not logged; admin actions inside someone else's project always are. */
  private async recordAdminAction(viaAdmin: boolean, type: ActivityType, video: Video, userId: string, actorName: string) {
    if (!viaAdmin) return;
    await this.activityLogService.record(video.projectId, type, userId, actorName, { videoTitle: video.title }, video.id);
  }
}
