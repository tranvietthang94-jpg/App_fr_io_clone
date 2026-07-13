import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Video } from './video.entity';
import { ProjectsService } from '../projects/projects.service';

@Injectable()
export class VideosService {
  constructor(
    @InjectRepository(Video)
    private videosRepository: Repository<Video>,
    private projectsService: ProjectsService,
  ) {}

  async findByProject(projectId: string) {
    return this.videosRepository.find({
      where: { projectId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOne(id: string) {
    const video = await this.videosRepository.findOne({ where: { id } });
    if (!video) {
      throw new NotFoundException('Video not found');
    }
    return video;
  }

  /**
   * Same as findOne, but also verifies the requesting user owns the video's
   * parent project. Reuses ProjectsService.findOne's owner-scoped lookup so
   * ownership rules live in one place.
   */
  async findOwned(id: string, userId: string) {
    const video = await this.findOne(id);
    await this.projectsService.findOne(video.projectId, userId);
    return video;
  }

  async create(data: {
    projectId: string;
    title: string;
    originalFilename: string;
    filePath: string;
    fileSize: number;
  }) {
    const video = this.videosRepository.create(data);
    return this.videosRepository.save(video);
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

  async delete(id: string) {
    const video = await this.findOne(id);
    await this.videosRepository.remove(video);
    return { success: true };
  }
}