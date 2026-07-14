import { IsIn } from 'class-validator';
import { VideoReviewStatus } from '../video.entity';

export class UpdateReviewStatusDto {
  @IsIn(Object.values(VideoReviewStatus))
  status: VideoReviewStatus;
}
