import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CommentsController } from './comments.controller';
import { CommentsService } from './comments.service';
import { AnnotationsController } from './annotations.controller';
import { AnnotationsService } from './annotations.service';
import { ReactionsController } from './reactions.controller';
import { ReactionsService } from './reactions.service';
import { Comment } from './comment.entity';
import { Annotation } from './annotation.entity';
import { CommentReaction } from './comment-reaction.entity';
import { VideosModule } from '../videos/videos.module';
import { ProjectsModule } from '../projects/projects.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Comment, Annotation, CommentReaction]),
    VideosModule,
    ProjectsModule,
    NotificationsModule,
  ],
  controllers: [CommentsController, AnnotationsController, ReactionsController],
  providers: [CommentsService, AnnotationsService, ReactionsService],
  exports: [CommentsService, AnnotationsService, ReactionsService],
})
export class CommentsModule {}
