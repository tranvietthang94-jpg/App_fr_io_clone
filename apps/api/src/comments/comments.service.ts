import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { Comment } from './comment.entity';
import { CommentReaction } from './comment-reaction.entity';
import { VideosService } from '../videos/videos.service';
import { ProjectsService } from '../projects/projects.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationType } from '../notifications/notification.entity';
import { MemberRole } from '../projects/project-member.entity';
import { ActivityLogService } from '../activity/activity-log.service';
import { ActivityType } from '../activity/activity-log.entity';

const MENTION_REGEX = /@\[([0-9a-fA-F-]{36})\]/g;

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentsRepository: Repository<Comment>,
    @InjectRepository(CommentReaction)
    private reactionsRepository: Repository<CommentReaction>,
    private videosService: VideosService,
    private projectsService: ProjectsService,
    private notificationsService: NotificationsService,
    private activityLogService: ActivityLogService,
  ) {}

  /**
   * Comment responses go out to anonymous share-link viewers too, so the
   * attached user must never carry the member's email (or hash — excluded at
   * the entity level via select:false).
   */
  private toPublicComment(comment: Comment): Comment {
    if (comment.user) {
      const u = comment.user;
      // Serialize only the public subset — email/hash/googleId never leave the API.
      comment.user = {
        id: u.id,
        name: u.name,
        avatarUrl: u.avatarUrl,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      } as unknown as Comment['user'];
    }
    return comment;
  }

  /**
   * Top-level comments for a video (replies are attached, not returned as
   * separate rows), with #N sequence numbers, replies, and reactions embedded.
   * No `limit` = every comment (backward compatible for callers like the PDF
   * export that need the full set). Pass `limit` to paginate.
   */
  async findByVideo(
    videoId: string,
    opts: { sort?: 'timecode' | 'date'; offset?: number; limit?: number } = {},
  ): Promise<{ items: any[]; nextOffset: number | null; totalCount: number }> {
    const sortColumn = opts.sort === 'date' ? 'createdAt' : 'timestamp';

    const qb = this.commentsRepository
      .createQueryBuilder('comment')
      .leftJoinAndSelect('comment.user', 'user')
      .where('comment.videoId = :videoId', { videoId })
      .andWhere('comment.parentId IS NULL')
      .orderBy(`comment.${sortColumn}`, 'ASC')
      .addOrderBy('comment.id', 'ASC');

    if (opts.offset) {
      qb.skip(opts.offset);
    }
    if (opts.limit) {
      qb.take(opts.limit);
    }

    const [pageItems, totalCount] = await qb.getManyAndCount();

    if (pageItems.length === 0) {
      return { items: [], nextOffset: null, totalCount };
    }

    const topLevelIds = pageItems.map((c) => c.id);

    const [replies, reactions, sequenceMap] = await Promise.all([
      this.commentsRepository.find({
        where: { parentId: In(topLevelIds) },
        relations: { user: true },
        order: { createdAt: 'ASC' },
      }),
      this.reactionsRepository.find({ where: { commentId: In(topLevelIds) } }),
      this.getSequenceNumbers(videoId),
    ]);

    const repliesByParent = new Map<string, Comment[]>();
    for (const reply of replies) {
      const list = repliesByParent.get(reply.parentId) || [];
      list.push(reply);
      repliesByParent.set(reply.parentId, list);
    }
    const reactionsByComment = new Map<string, CommentReaction[]>();
    for (const r of reactions) {
      const list = reactionsByComment.get(r.commentId) || [];
      list.push(r);
      reactionsByComment.set(r.commentId, list);
    }

    const items = pageItems.map((c) => ({
      ...this.toPublicComment(c),
      sequenceNumber: sequenceMap.get(c.id) ?? null,
      replies: (repliesByParent.get(c.id) || []).map((r) => this.toPublicComment(r)),
      reactions: reactionsByComment.get(c.id) || [],
    }));

    const nextOffset =
      opts.limit && (opts.offset ?? 0) + pageItems.length < totalCount
        ? (opts.offset ?? 0) + pageItems.length
        : null;

    return { items, nextOffset, totalCount };
  }

  /**
   * Stable #N rank of every top-level comment on a video, by creation order.
   * Shared by the live UI and the PDF export so both show the same numbers.
   * Not persisted — deleting an older comment will shift later numbers; a
   * persisted sequence column is the upgrade path if that ever proves wrong.
   */
  async getSequenceNumbers(videoId: string): Promise<Map<string, number>> {
    const topLevel = await this.commentsRepository.find({
      where: { videoId, parentId: IsNull() },
      order: { createdAt: 'ASC' },
      select: { id: true },
    });
    const map = new Map<string, number>();
    topLevel.forEach((c, i) => map.set(c.id, i + 1));
    return map;
  }

  async findOne(id: string) {
    const comment = await this.commentsRepository.findOne({ where: { id }, relations: { user: true } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return this.toPublicComment(comment);
  }

  async create(data: {
    videoId: string;
    userId?: string | null;
    guestName?: string;
    guestEmail?: string;
    shareLinkId?: string;
    actorName: string;
    content: string;
    timestamp: number;
    frameNumber: number;
    positionX?: number;
    positionY?: number;
    parentId?: string;
  }) {
    const { actorName, ...commentData } = data;

    let parent: Comment | null = null;
    if (commentData.parentId) {
      parent = await this.commentsRepository.findOne({ where: { id: commentData.parentId } });
      if (!parent || parent.videoId !== commentData.videoId) {
        throw new BadRequestException('Parent comment does not belong to this video');
      }
    }

    const isGuest = !commentData.userId;
    const comment = this.commentsRepository.create({
      ...commentData,
      userId: commentData.userId ?? null,
      guestEditToken: isGuest ? randomBytes(16).toString('hex') : null,
    });
    const saved = await this.commentsRepository.save(comment);

    if (!saved.parentId) {
      const video = await this.videosService.findOne(saved.videoId);
      await this.activityLogService.record(
        video.projectId,
        ActivityType.COMMENT_ADDED,
        saved.userId,
        actorName,
        { snippet: saved.content.slice(0, 140) },
        saved.videoId,
      );
    }

    if (parent && parent.userId && parent.userId !== saved.userId) {
      await this.notificationsService.create(parent.userId, NotificationType.REPLY, {
        actorId: saved.userId,
        actorName,
        commentId: saved.id,
        parentCommentId: parent.id,
        videoId: saved.videoId,
        content: saved.content,
      });
    }

    await this.notifyMentions(saved, actorName);

    return saved;
  }

  /** Guest-authored comments have no account, so ownership is proven by a bearer token issued at creation time. */
  private async assertGuestOwnership(id: string, editToken: string): Promise<void> {
    const comment = await this.commentsRepository.findOne({
      where: { id },
      select: { id: true, guestEditToken: true },
    });
    if (!comment || !comment.guestEditToken || comment.guestEditToken !== editToken) {
      throw new ForbiddenException('Not allowed to modify this comment');
    }
  }

  async updateAsGuest(id: string, editToken: string, data: { content?: string }) {
    await this.assertGuestOwnership(id, editToken);
    await this.commentsRepository.update(id, data);
    return this.findOne(id);
  }

  async deleteAsGuest(id: string, editToken: string) {
    await this.assertGuestOwnership(id, editToken);
    await this.commentsRepository.delete(id);
    return { success: true };
  }

  private async notifyMentions(comment: Comment, actorName: string) {
    const mentionedIds = this.extractMentionedUserIds(comment.content);
    if (mentionedIds.length === 0) {
      return;
    }
    const video = await this.videosService.findOne(comment.videoId);
    for (const mentionedUserId of mentionedIds) {
      if (mentionedUserId === comment.userId) {
        continue;
      }
      const role = await this.projectsService.getMemberRole(video.projectId, mentionedUserId);
      if (!role) {
        continue; // not a project member — ignore silently, don't leak membership info
      }
      await this.notificationsService.create(mentionedUserId, NotificationType.MENTION, {
        actorId: comment.userId,
        actorName,
        commentId: comment.id,
        videoId: comment.videoId,
        content: comment.content,
      });
    }
  }

  private extractMentionedUserIds(content: string): string[] {
    const ids = new Set<string>();
    let match: RegExpExecArray | null;
    MENTION_REGEX.lastIndex = 0;
    while ((match = MENTION_REGEX.exec(content)) !== null) {
      ids.add(match[1]);
    }
    return [...ids];
  }

  private canModerate(role: MemberRole | null): boolean {
    return role === MemberRole.ADMIN || role === MemberRole.OWNER;
  }

  async update(id: string, data: { content?: string }, userId: string, role: MemberRole | null) {
    const comment = await this.findOne(id);
    if (comment.userId !== userId && !this.canModerate(role)) {
      throw new ForbiddenException('Not allowed to edit this comment');
    }
    Object.assign(comment, data);
    return this.commentsRepository.save(comment);
  }

  async delete(id: string, userId: string, role: MemberRole | null) {
    const comment = await this.findOne(id);
    if (comment.userId !== userId && !this.canModerate(role)) {
      throw new ForbiddenException('Not allowed to delete this comment');
    }
    await this.commentsRepository.remove(comment);
    return { success: true };
  }

  async setResolved(id: string, resolved: boolean, userId: string, role: MemberRole | null, actorName: string) {
    const comment = await this.findOne(id);
    const isAuthor = comment.userId === userId;
    // Reviewer can resolve their own comments; Editor/Admin/Owner can resolve any.
    const canModerateAny = role === MemberRole.EDITOR || this.canModerate(role);
    if (!isAuthor && !canModerateAny) {
      throw new ForbiddenException('Not allowed to resolve this comment');
    }
    comment.resolved = resolved;
    comment.resolvedBy = resolved ? userId : null;
    comment.resolvedAt = resolved ? new Date() : null;
    const saved = await this.commentsRepository.save(comment);

    if (resolved && !isAuthor && comment.userId) {
      await this.notificationsService.create(comment.userId, NotificationType.RESOLVE, {
        actorId: userId,
        actorName,
        commentId: comment.id,
        videoId: comment.videoId,
      });
    }

    return saved;
  }
}
