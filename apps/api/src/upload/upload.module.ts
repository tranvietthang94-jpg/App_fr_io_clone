import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { VideosModule } from '../videos/videos.module';
import { TranscodeModule } from '../media/transcode.module';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [VideosModule, TranscodeModule, ProjectsModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
