import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ProjectsController } from './projects.controller';
import { InvitesController } from './invites.controller';
import { ProjectsService } from './projects.service';
import { Project } from './project.entity';
import { ProjectMember } from './project-member.entity';
import { User } from '../auth/user.entity';
import { MailerModule } from '../mailer/mailer.module';
import { ActivityModule } from '../activity/activity.module';

@Module({
  imports: [TypeOrmModule.forFeature([Project, ProjectMember, User]), MailerModule, ActivityModule],
  controllers: [ProjectsController, InvitesController],
  providers: [ProjectsService],
  exports: [ProjectsService],
})
export class ProjectsModule {}