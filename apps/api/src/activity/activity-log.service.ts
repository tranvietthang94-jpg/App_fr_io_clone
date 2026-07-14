import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ActivityLog, ActivityType } from './activity-log.entity';

const DEFAULT_PAGE_SIZE = 30;

@Injectable()
export class ActivityLogService {
  constructor(
    @InjectRepository(ActivityLog)
    private activityLogRepository: Repository<ActivityLog>,
  ) {}

  async record(
    projectId: string,
    type: ActivityType,
    actorId: string | null,
    actorName: string,
    payload: Record<string, unknown>,
    videoId?: string,
  ) {
    const entry = this.activityLogRepository.create({
      projectId,
      videoId: videoId ?? null,
      actorId,
      actorName,
      type,
      payload,
    });
    return this.activityLogRepository.save(entry);
  }

  async findByProject(projectId: string, opts: { before?: Date; limit?: number } = {}) {
    return this.activityLogRepository.find({
      where: opts.before ? { projectId, createdAt: LessThan(opts.before) } : { projectId },
      order: { createdAt: 'DESC' },
      take: opts.limit ?? DEFAULT_PAGE_SIZE,
    });
  }
}
