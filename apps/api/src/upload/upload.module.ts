import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { VideosModule } from '../videos/videos.module';
import { MediaModule } from '../media/media.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [VideosModule, MediaModule, ProjectsModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
