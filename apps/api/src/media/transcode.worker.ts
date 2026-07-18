import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Job, Worker } from 'bullmq';
import { MediaService } from './media.service';
import { VideosService } from '../videos/videos.service';
import { CollaborationGateway } from '../gateway/collaboration.gateway';
import { redisConnectionOptions, TRANSCODE_QUEUE_NAME } from './redis.connection';
import { TranscodeJobData } from './transcode.queue';

/**
 * BullMQ worker that runs the actual ffmpeg transcode off the request path.
 * Survives restarts: BullMQ re-runs jobs that were active when the process
 * died (stalled-job recovery), so a crash mid-transcode no longer strands a
 * video at `processing` forever.
 */
@Injectable()
export class TranscodeWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(TranscodeWorker.name);
  private worker?: Worker<TranscodeJobData>;

  constructor(
    private readonly mediaService: MediaService,
    private readonly videosService: VideosService,
    private readonly gateway: CollaborationGateway,
  ) {}

  onModuleInit() {
    const concurrency = parseInt(process.env.TRANSCODE_CONCURRENCY || '2', 10) || 2;

    this.worker = new Worker<TranscodeJobData>(
      TRANSCODE_QUEUE_NAME,
      async (job: Job<TranscodeJobData>) => {
        const { videoId, filePath } = job.data;
        this.logger.log(`Processing transcode job ${job.id} (video ${videoId})`);
        await this.mediaService.transcodeVideo(videoId, filePath, (percent) => {
          this.gateway.emitToVideo(videoId, 'video:transcode-progress', { videoId, percent });
        });
        this.gateway.emitToVideo(videoId, 'video:transcode-progress', { videoId, percent: 100, status: 'ready' });
      },
      { connection: redisConnectionOptions(), concurrency },
    );

    this.worker.on('failed', async (job, err) => {
      if (!job) return;
      const { videoId } = job.data;
      const attemptsAllowed = job.opts.attempts ?? 1;
      this.logger.error(
        `Transcode job ${job.id} attempt ${job.attemptsMade}/${attemptsAllowed} failed: ${err.message}`,
      );
      // Only surface `failed` once retries are exhausted — a transient ffmpeg
      // hiccup shouldn't flip the video to a dead state that a later attempt
      // would silently contradict.
      if (job.attemptsMade >= attemptsAllowed) {
        await this.videosService.updateStatus(videoId, 'failed').catch((e) =>
          this.logger.error(`Could not mark video ${videoId} failed: ${e.message}`),
        );
        this.gateway.emitToVideo(videoId, 'video:transcode-progress', { videoId, status: 'failed' });
      }
    });

    this.worker.on('error', (err) => {
      this.logger.error(`Transcode worker error: ${err.message}`);
    });

    this.logger.log(`Transcode worker started (concurrency=${concurrency})`);
  }

  async onModuleDestroy() {
    await this.worker?.close();
  }
}
