import { Module } from '@nestjs/common';
import { UploadController } from './upload.controller';
import { UploadService } from './upload.service';
import { VideosModule } from '../videos/videos.module';
import { MediaModule } from '../media/media.module';

@Module({
  imports: [VideosModule, MediaModule],
  controllers: [UploadController],
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
