import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Notification, NotificationType } from './notification.entity';
import { CollaborationGateway } from '../gateway/collaboration.gateway';

@Injectable()
export class NotificationsService {
  constructor(
    @InjectRepository(Notification)
    private notificationsRepository: Repository<Notification>,
    private collaborationGateway: CollaborationGateway,
  ) {}

  async create(userId: string, type: NotificationType, payload: Record<string, unknown>) {
    const notification = this.notificationsRepository.create({ userId, type, payload });
    const saved = await this.notificationsRepository.save(notification);
    this.collaborationGateway.emitToUser(userId, 'notification:new', saved);
    return saved;
  }

  async findByUser(userId: string, unreadOnly = false) {
    return this.notificationsRepository.find({
      where: unreadOnly ? { userId, read: false } : { userId },
      order: { createdAt: 'DESC' },
      take: 50,
    });
  }

  async markRead(id: string, userId: string) {
    const notification = await this.notificationsRepository.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    notification.read = true;
    return this.notificationsRepository.save(notification);
  }

  async markAllRead(userId: string) {
    await this.notificationsRepository.update({ userId, read: false }, { read: true });
    return { success: true };
  }
}
