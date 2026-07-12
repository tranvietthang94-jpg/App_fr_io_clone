import { Module, forwardRef } from '@nestjs/common';
import { MediaService } from './media.service';
import { VideosModule } from '../videos/videos.module';

@Module({
  imports: [forwardRef(() => VideosModule)],
  providers: [MediaService],
  exports: [MediaService],
})
export class MediaModule {}
