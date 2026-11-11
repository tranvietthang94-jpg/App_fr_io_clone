import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Folder } from './folder.entity';
import { Video } from './video.entity';
import { ProjectsService } from '../projects/projects.service';
import { MemberRole } from '../projects/project-member.entity';
import { ProjectAction } from '../projects/project-access';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityType } from '../activity/activity-log.entity';
import { VideosService } from './videos.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class FoldersService {
  constructor(
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    @InjectRepository(Video)
    private videosRepository: Repository<Video>,
    private projectsService: ProjectsService,
    private activityLogService: ActivityLogService,
    private videosService: VideosService,
    private storage: StorageService,
  ) {}

  async findByProject(projectId: string, userId: string, parentFolderId?: string | null) {
    await this.projectsService.findOne(projectId, userId);
    const qb = this.foldersRepository
      .createQueryBuilder('folder')
      .where('folder.projectId = :projectId', { projectId })
      .orderBy('folder.name', 'ASC');

    if (parentFolderId === null || parentFolderId === undefined) {
      qb.andWhere('folder.parentFolderId IS NULL');
    } else {
      qb.andWhere('folder.parentFolderId = :parentFolderId', { parentFolderId });
    }
    return qb.getMany();
  }

  async create(projectId: string, userId: string, data: { name: string; parentFolderId?: string | null }) {
    await this.projectsService.assertRole(projectId, userId, MemberRole.EDITOR);

    if (data.parentFolderId) {
      const parent = await this.foldersRepository.findOne({ where: { id: data.parentFolderId } });
      if (!parent || parent.projectId !== projectId) {
        throw new BadRequestException('Parent folder does not belong to this project');
      }
    }

    const folder = this.foldersRepository.create({
      projectId,
      name: data.name,
      parentFolderId: data.parentFolderId || null,
    });
    return this.foldersRepository.save(folder);
  }

  async rename(id: string, name: string, userId: string) {
    const folder = await this.findOneOrThrow(id);
    await this.projectsService.assertRole(folder.projectId, userId, MemberRole.EDITOR);
    folder.name = name;
    return this.foldersRepository.save(folder);
  }

  /** Deletes the folder; videos/subfolders inside it move up to its parent rather than being deleted. */
  async delete(id: string, userId: string, actorName = '') {
    const folder = await this.findOneOrThrow(id);
    const { viaAdmin } = await this.projectsService.authorize(folder.projectId, userId, ProjectAction.CONTENT);

    await this.videosRepository.update({ folderId: id }, { folderId: folder.parentFolderId });
    await this.foldersRepository.update({ parentFolderId: id }, { parentFolderId: folder.parentFolderId });
    await this.foldersRepository.remove(folder);
    if (viaAdmin) {
      await this.activityLogService.record(folder.projectId, ActivityType.ADMIN_FOLDER_DELETED, userId, actorName, { folderName: folder.name });
    }
    return { success: true };
  }

  /** The folder and all its descendants, parents before children. */
  private subtree(all: Folder[], root: Folder): Folder[] {
    const result = [root];
    for (let i = 0; i < result.length; i++) {
      result.push(...all.filter((f) => f.parentFolderId === result[i].id));
    }
    return result;
  }

  /** Every video row (all versions, trashed included) filed in the folder tree. */
  private async subtreeContents(folder: Folder) {
    const all = await this.foldersRepository.find({ where: { projectId: folder.projectId } });
    const folders = this.subtree(all, folder);
    const videos = await this.videosRepository.find({
      where: { projectId: folder.projectId, folderId: In(folders.map((f) => f.id)) },
    });
    return { folders, videos };
  }

  /**
   * Recursive copy: subfolders plus the latest non-trashed version of every asset. Each file is charged to
   * its own uploader in ONE all-or-nothing chargeMany BEFORE anything is copied; a failure rolls back
   * the copies, the new folders and the charges.
   */
  async copyFolder(id: string, dto: { targetProjectId: string; targetParentFolderId: string | null }, userId: string, actorName: string) {
    const src = await this.findOneOrThrow(id);
    const from = await this.projectsService.authorize(src.projectId, userId, ProjectAction.CONTENT);
    const to =
      dto.targetProjectId === src.projectId
        ? from
        : await this.projectsService.authorize(dto.targetProjectId, userId, ProjectAction.CONTENT);

    if (dto.targetParentFolderId) {
      const parent = await this.foldersRepository.findOne({ where: { id: dto.targetParentFolderId } });
      if (!parent || parent.projectId !== dto.targetProjectId) {
        throw new BadRequestException('Thư mục đích không thuộc project đích');
      }
    }
    const all = await this.foldersRepository.find({ where: { projectId: src.projectId } });
    const tree = this.subtree(all, src);
    if (dto.targetParentFolderId && dto.targetProjectId === src.projectId && tree.some((f) => f.id === dto.targetParentFolderId)) {
      throw new BadRequestException('Không thể copy thư mục vào chính nó hoặc thư mục con của nó');
    }

    const candidates = await this.videosRepository.find({
      where: { projectId: src.projectId, folderId: In(tree.map((f) => f.id)), deletedAt: IsNull() },
    });
    const latest = new Map<string, (typeof candidates)[number]>();
    for (const v of candidates) {
      const best = latest.get(v.assetGroupId);
      if (!best || v.versionNumber > best.versionNumber) latest.set(v.assetGroupId, v);
    }
    const videos = [...latest.values()];
    videos.forEach((v) => this.videosService.assertReady(v));

    const charges = new Map<string, number>();
    for (const v of videos) {
      const payer = v.uploadedById ?? userId;
      charges.set(payer, (charges.get(payer) ?? 0) + Number(v.fileSize));
    }
    await this.storage.chargeMany(charges);

    const newFolders: Folder[] = [];
    const clones: Video[] = [];
    try {
      const idMap = new Map<string, string>();
      for (const f of tree) {
        const saved = await this.foldersRepository.save(
          this.foldersRepository.create({
            projectId: dto.targetProjectId,
            name: f.name,
            parentFolderId: f.id === src.id ? dto.targetParentFolderId : idMap.get(f.parentFolderId as string),
          }),
        );
        newFolders.push(saved);
        idMap.set(f.id, saved.id);
      }
      for (const v of videos) {
        clones.push(
          await this.videosService.cloneVideo(v, {
            projectId: dto.targetProjectId,
            folderId: idMap.get(v.folderId as string) as string,
            uploadedById: v.uploadedById ?? userId,
          }),
        );
      }
    } catch (err) {
      // destroyVideos credits what the finished clones were charged; credit the rest by hand.
      await this.storage.destroyVideos(clones);
      for (const c of clones) charges.set(c.uploadedById as string, (charges.get(c.uploadedById as string) ?? 0) - Number(c.fileSize));
      for (const [payer, bytes] of charges) await this.storage.credit(payer, bytes);
      if (newFolders.length > 0) await this.foldersRepository.remove(newFolders);
      throw err;
    }

    await this.activityLogService.record(dto.targetProjectId, ActivityType.FOLDER_COPIED, userId, actorName, {
      folderName: src.name,
      videoCount: clones.length,
      viaAdmin: from.viaAdmin || to.viaAdmin,
      sourceProjectId: src.projectId,
    });
    return newFolders[0];
  }

  /** Destroys the folder tree and every video in it (all versions, trashed too). confirmName is checked here. */
  async deletePermanently(id: string, confirmName: string, userId: string, actorName: string) {
    const folder = await this.findOneOrThrow(id);
    const { viaAdmin } = await this.projectsService.authorize(folder.projectId, userId, ProjectAction.CONTENT);
    if (confirmName.trim() !== folder.name) throw new BadRequestException('Tên xác nhận không khớp');
    const { folders, videos } = await this.subtreeContents(folder);
    await this.storage.destroyVideos(videos);
    await this.foldersRepository.remove(folders);
    await this.activityLogService.record(folder.projectId, ActivityType.FOLDER_DELETED_PERMANENTLY, userId, actorName, {
      folderName: folder.name,
      videoCount: videos.length,
      viaAdmin,
    });
    return { success: true };
  }

  async getDeletePreview(id: string, userId: string) {
    const folder = await this.findOneOrThrow(id);
    await this.projectsService.authorize(folder.projectId, userId, ProjectAction.READ);
    const { videos } = await this.subtreeContents(folder);
    return { name: folder.name, videoCount: videos.length, totalBytes: videos.reduce((sum, v) => sum + Number(v.fileSize), 0) };
  }

  private async findOneOrThrow(id: string): Promise<Folder> {
    const folder = await this.foldersRepository.findOne({ where: { id } });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }
}
