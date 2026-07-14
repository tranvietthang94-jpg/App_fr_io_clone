import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ShareLink, SharePermission } from './share-link.entity';
import { VideosService } from '../videos/videos.service';
import { ProjectsService } from '../projects/projects.service';
import { MemberRole } from '../projects/project-member.entity';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityType } from '../activity/activity-log.entity';

@Injectable()
export class ShareLinksService {
  constructor(
    @InjectRepository(ShareLink)
    private shareLinksRepository: Repository<ShareLink>,
    private videosService: VideosService,
    private projectsService: ProjectsService,
    private activityLogService: ActivityLogService,
  ) {}

  async create(
    videoId: string,
    userId: string,
    actorName: string,
    data: { permission?: SharePermission; expiresAt?: string; password?: string },
  ) {
    const video = await this.videosService.findOwned(videoId, userId);
    await this.projectsService.assertRole(video.projectId, userId, MemberRole.EDITOR);

    const link = this.shareLinksRepository.create({
      videoId,
      createdBy: userId,
      token: randomBytes(24).toString('hex'),
      permission: data.permission ?? SharePermission.CAN_COMMENT,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
      passwordHash: data.password ? await bcrypt.hash(data.password, 10) : null,
    });
    const saved = await this.shareLinksRepository.save(link);

    await this.activityLogService.record(
      video.projectId,
      ActivityType.SHARE_LINK_CREATED,
      userId,
      actorName,
      { permission: saved.permission },
      videoId,
    );

    return saved;
  }

  async listForVideo(videoId: string, userId: string) {
    const video = await this.videosService.findOwned(videoId, userId);
    await this.projectsService.assertRole(video.projectId, userId, MemberRole.EDITOR);
    return this.shareLinksRepository.find({ where: { videoId }, order: { createdAt: 'DESC' } });
  }

  async revoke(id: string, userId: string) {
    const link = await this.shareLinksRepository.findOne({ where: { id } });
    if (!link) {
      throw new NotFoundException('Share link not found');
    }
    const video = await this.videosService.findOwned(link.videoId, userId);
    await this.projectsService.assertRole(video.projectId, userId, MemberRole.EDITOR);
    link.revokedAt = new Date();
    return this.shareLinksRepository.save(link);
  }

  /**
   * Single method reused by the HTTP guard and the gateway's guest handshake.
   * Returns 404 (not 403) for missing/revoked/expired links, matching this
   * codebase's "don't leak existence" convention (forgotPassword/acceptInvite).
   */
  async resolveForAccess(token: string, password?: string): Promise<ShareLink> {
    const link = await this.shareLinksRepository.findOne({ where: { token }, relations: ['video'] });
    if (!link || link.revokedAt || link.video.deletedAt) {
      throw new NotFoundException('Link not found');
    }
    if (link.expiresAt && link.expiresAt.getTime() < Date.now()) {
      throw new NotFoundException('Link not found');
    }
    if (link.passwordHash) {
      if (!password || !(await bcrypt.compare(password, link.passwordHash))) {
        throw new UnauthorizedException('Password required');
      }
    }
    return link;
  }
}
