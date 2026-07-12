import { Module } from '@nestjs/common';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';
import { CommentsModule } from '../comments/comments.module';
import { VideosModule } from '../videos/videos.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [CommentsModule, VideosModule, ProjectsModule],
  controllers: [ExportController],
  providers: [ExportService],
  exports: [ExportService],
})
export class ExportModule {}