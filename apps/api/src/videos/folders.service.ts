import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Folder } from './folder.entity';
import { Video } from './video.entity';
import { ProjectsService } from '../projects/projects.service';
import { MemberRole } from '../projects/project-member.entity';

@Injectable()
export class FoldersService {
  constructor(
    @InjectRepository(Folder)
    private foldersRepository: Repository<Folder>,
    @InjectRepository(Video)
    private videosRepository: Repository<Video>,
    private projectsService: ProjectsService,
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
  async delete(id: string, userId: string) {
    const folder = await this.findOneOrThrow(id);
    await this.projectsService.assertRole(folder.projectId, userId, MemberRole.EDITOR);

    await this.videosRepository.update({ folderId: id }, { folderId: folder.parentFolderId });
    await this.foldersRepository.update({ parentFolderId: id }, { parentFolderId: folder.parentFolderId });
    await this.foldersRepository.remove(folder);
    return { success: true };
  }

  private async findOneOrThrow(id: string): Promise<Folder> {
    const folder = await this.foldersRepository.findOne({ where: { id } });
    if (!folder) {
      throw new NotFoundException('Folder not found');
    }
    return folder;
  }
}
