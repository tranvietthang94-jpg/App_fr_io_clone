import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { AdminGuard } from './admin.guard';
import { User } from '../auth/user.entity';
import { Project } from '../projects/project.entity';
import { ProjectMember } from '../projects/project-member.entity';

// Leaf module: repositories only, no feature-module imports, so it cannot join a cycle.
@Module({
  imports: [TypeOrmModule.forFeature([User, Project, ProjectMember])],
  controllers: [AdminController],
  providers: [AdminService, AdminGuard],
})
export class AdminModule {}
