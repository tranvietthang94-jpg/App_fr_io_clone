import { Module } from '@nestjs/common';
import { MediaModule } from './media.module';
import { VideosModule } from '../videos/videos.module';
import { CollaborationModule } from '../gateway/collaboration.module';
import { TranscodeQueue } from './transcode.queue';
import { TranscodeWorker } from './transcode.worker';

/**
 * Owns the BullMQ transcode queue + worker. Kept separate from MediaModule so
 * MediaModule (imported by VideosModule) stays free of the CollaborationModule
 * dependency the worker needs — that would close a VideosModule <-> MediaModule
 * <-> CollaborationModule cycle. Nothing in that cycle imports this module.
 */
@Module({
  imports: [MediaModule, VideosModule, CollaborationModule],
  providers: [TranscodeQueue, TranscodeWorker],
  exports: [TranscodeQueue],
})
export class TranscodeModule {}
