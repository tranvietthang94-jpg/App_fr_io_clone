import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CommentReaction } from './comment-reaction.entity';
import { CommentsService } from './comments.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';

@Injectable()
export class ReactionsService {
  constructor(
    @InjectRepository(CommentReaction)
    private reactionsRepository: Repository<CommentReaction>,
    private commentsService: CommentsService,
    private notificationsService: NotificationsService,
  ) {}

  /** Toggles the caller's reaction with this emoji on this comment — idempotent by (commentId, userId, emoji). */
  async toggle(commentId: string, userId: string, emoji: string, actorName: string) {
    const existing = await this.reactionsRepository.findOne({ where: { commentId, userId, emoji } });
    if (existing) {
      await this.reactionsRepository.remove(existing);
      return { active: false };
    }
    const reaction = this.reactionsRepository.create({ commentId, userId, emoji });
    await this.reactionsRepository.save(reaction);

    const comment = await this.commentsService.findOne(commentId);
    if (comment.userId !== userId) {
      await this.notificationsService.create(comment.userId, NotificationType.REACTION, {
        actorId: userId,
        actorName,
        commentId,
        videoId: comment.videoId,
        emoji,
      });
    }

    return { active: true };
  }

  async findByComment(commentId: string) {
    return this.reactionsRepository.find({ where: { commentId } });
  }
}
