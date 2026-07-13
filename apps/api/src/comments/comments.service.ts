import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Comment } from './comment.entity';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment)
    private commentsRepository: Repository<Comment>,
  ) {}

  async findByVideo(videoId: string) {
    return this.commentsRepository.find({
      where: { videoId },
      relations: ['user'],
      order: { timestamp: 'ASC' },
    });
  }

  async findOne(id: string) {
    const comment = await this.commentsRepository.findOne({ where: { id } });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    return comment;
  }

  async create(data: {
    videoId: string;
    userId: string;
    content: string;
    timestamp: number;
    frameNumber: number;
    positionX?: number;
    positionY?: number;
    parentId?: string;
  }) {
    const comment = this.commentsRepository.create(data);
    return this.commentsRepository.save(comment);
  }

  async update(id: string, data: { content?: string }, userId: string) {
    const comment = await this.commentsRepository.findOne({
      where: { id, userId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    Object.assign(comment, data);
    return this.commentsRepository.save(comment);
  }

  async delete(id: string, userId: string) {
    const comment = await this.commentsRepository.findOne({
      where: { id, userId },
    });
    if (!comment) {
      throw new NotFoundException('Comment not found');
    }
    await this.commentsRepository.remove(comment);
    return { success: true };
  }
}