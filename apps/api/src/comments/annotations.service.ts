import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Annotation } from './annotation.entity';

@Injectable()
export class AnnotationsService {
  constructor(
    @InjectRepository(Annotation)
    private annotationsRepository: Repository<Annotation>,
  ) {}

  async create(data: { commentId: string; type: string; data: Record<string, any> }) {
    const annotation = this.annotationsRepository.create(data);
    return this.annotationsRepository.save(annotation);
  }

  async findByVideo(videoId: string) {
    return this.annotationsRepository
      .createQueryBuilder('annotation')
      .innerJoin('annotation.comment', 'comment')
      .where('comment.videoId = :videoId', { videoId })
      .getMany();
  }

  async findOne(id: string) {
    const annotation = await this.annotationsRepository.findOne({ where: { id } });
    if (!annotation) {
      throw new NotFoundException('Annotation not found');
    }
    return annotation;
  }

  async update(id: string, data: { type?: string; data?: Record<string, any> }) {
    const annotation = await this.findOne(id);
    Object.assign(annotation, data);
    return this.annotationsRepository.save(annotation);
  }

  async delete(id: string) {
    const annotation = await this.findOne(id);
    await this.annotationsRepository.remove(annotation);
    return { success: true };
  }
}
