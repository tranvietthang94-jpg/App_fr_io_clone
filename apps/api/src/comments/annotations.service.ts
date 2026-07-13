import { Injectable } from '@nestjs/common';
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
}
