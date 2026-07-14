import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShareLink } from './share-link.entity';
import { ShareLinksService } from './share-links.service';
import { ShareLinksController } from './share-links.controller';
import { PublicReviewController } from './public-review.controller';
import { ShareLinkGuard } from './guards/share-link.guard';
import { VideosModule } from '../videos/videos.module';
import { ProjectsModule } from '../projects/projects.module';
import { CommentsModule } from '../comments/comments.module';
import { ActivityModule } from '../activity/activity.module';

// forwardRef on CommentsModule: CommentsModule -> NotificationsModule ->
// CollaborationModule -> ShareLinksModule -> CommentsModule would otherwise
// be a hard circular require between these four modules.
@Module({
  imports: [
    TypeOrmModule.forFeature([ShareLink]),
    VideosModule,
    ProjectsModule,
    forwardRef(() => CommentsModule),
    ActivityModule,
  ],
  controllers: [ShareLinksController, PublicReviewController],
  providers: [ShareLinksService, ShareLinkGuard],
  exports: [ShareLinksService],
})
export class ShareLinksModule {}
