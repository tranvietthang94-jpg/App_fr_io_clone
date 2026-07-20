import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import { redisConnectionOptions, TRANSCODE_QUEUE_NAME } from './redis.connection';

export interface TranscodeJobData {
  videoId: string;
  filePath: string;
  /**
   * Who uploaded it. Progress is pushed to this user's personal room as well
   * as the video room, so the uploader sitting on the project file browser
   * (which isn't in any video room) still sees live progress.
   */
  uploaderId?: string;
}

/**
 * Durable transcode queue. Replaces the old fire-and-forget
 * `transcodeVideo(...).catch()` — jobs persist in Redis, so a server crash
 * mid-transcode leaves a recoverable job (BullMQ re-runs stalled/failed jobs)
 * instead of a video stuck at `processing` forever.
 */
@Injectable()
export class TranscodeQueue implements OnModuleDestroy {
  private readonly logger = new Logger(TranscodeQueue.name);
  private readonly queue = new Queue<TranscodeJobData>(TRANSCODE_QUEUE_NAME, {
    connection: redisConnectionOptions(),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 500,
    },
  });

  async enqueue(videoId: string, filePath: string, uploaderId?: string): Promise<void> {
    // jobId = videoId prevents stacking duplicate jobs for the same video.
    // A finished job (completed/failed) still occupies the id because of the
    // removeOnComplete/removeOnFail retention, so clear it first to let a
    // manual re-transcode actually run again; a still-running job is left
    // alone (dedupe).
    const existing = await this.queue.getJob(videoId);
    if (existing) {
      const state = await existing.getState();
      if (state === 'completed' || state === 'failed') {
        await existing.remove();
      } else {
        this.logger.warn(`Transcode already queued/active for video ${videoId}, skipping duplicate`);
        return;
      }
    }
    await this.queue.add('transcode', { videoId, filePath, uploaderId }, { jobId: videoId });
    this.logger.log(`Enqueued transcode job for video ${videoId}`);
  }

  async onModuleDestroy() {
    await this.queue.close();
  }
}
