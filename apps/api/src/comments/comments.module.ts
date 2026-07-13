import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { AnnotationsController } from './annotations.controller';
import { AnnotationsService } from './annotations.service';
import { Comment } from './comment.entity';
import { Annotation } from './annotation.entity';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [TypeOrmModule.forFeature([Comment, Annotation]), VideosModule],
  controllers: [CommentsController, AnnotationsController],
  providers: [CommentsService, AnnotationsService],
  exports: [CommentsService, AnnotationsService],
})
export class CommentsModule {}
