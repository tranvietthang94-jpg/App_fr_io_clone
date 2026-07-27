import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { InvitesController } from './invites.controller';
import { ProjectsService } from './projects.service';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { User } from '../auth/user.entity';
import { Notification } from '../notifications/notification.entity';
import { MailerModule } from '../mailer/mailer.module';
import { ActivityModule } from '../activity/activity.module';

// Note: we inject the Notification repository directly (leaf dependency)
// rather than NotificationsModule/Service — importing that module would pull
// in CollaborationModule -> VideosModule -> ProjectsModule and create a module
// cycle. See ProjectsService.invite for the (persist-only) tradeoff.
@Module({
  imports: [
    TypeOrmModule.forFeature([Project, ProjectMember, User, Notification]),
    MailerModule,
    ActivityModule,
  ],
  controllers: [ProjectsController, InvitesController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}