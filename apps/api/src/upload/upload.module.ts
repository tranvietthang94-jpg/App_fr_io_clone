import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { VideosModule } from '../videos/videos.module';
import { TranscodeModule } from '../media/transcode.module';
import { ProjectsModule } from '../projects/projects.module';
import { StorageModule } from '../storage/storage.module';

@Module({
  imports: [VideosModule, TranscodeModule, ProjectsModule, StorageModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
