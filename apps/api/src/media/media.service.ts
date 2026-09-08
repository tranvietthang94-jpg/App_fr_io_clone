import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { VideosService } from '../videos/videos.service';
import { armProcessKillTimer } from '../common/process-timeout.util';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  private readonly ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  private readonly outputDir = path.join(process.cwd(), 'uploads', 'transcoded');
  // Input is user-supplied media — a hung/crafted file must not occupy a
  // worker slot forever. Generous because legit 4K files transcode slowly.
  private readonly transcodeTimeoutMs =
    (parseInt(process.env.TRANSCODE_TIMEOUT_SECONDS || '7200', 10) || 7200) * 1000;
  /** Sticky: one NVENC failure on this process → stay on libx264. */
  private nvencUnavailable = (process.env.TRANSCODE_VIDEO_ENCODER || 'h264_nvenc') === 'libx264';

  constructor(private videosService: VideosService) {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  /**
   * Get video metadata using ffprobe
   */
  async getVideoMetadata(videoPath: string): Promise<{
    duration: number;
    width: number;
    height: number;
    fps: number;
    bitrate: number;
  }> {
    return new Promise((resolve, reject) => {
      const args = [
        '-v', 'quiet',
        '-print_format', 'json',
        '-show_format',
        '-show_streams',
        videoPath,
      ];

      const ffprobe = spawn(this.ffprobePath, args);
      let stdout = '';
      let stderr = '';
      const disarm = armProcessKillTimer(ffprobe, 60_000);

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('error', (err) => {
        disarm();
        reject(err);
      });

      ffprobe.on('close', (code) => {
        disarm();
        if (code !== 0) {
          this.logger.error(`ffprobe error: ${stderr}`);
          reject(new Error(`ffprobe exited with code ${code}`));
          return;
        }

        try {
          const metadata = JSON.parse(stdout);
          const videoStream = metadata.streams?.find((s: any) => s.codec_type === 'video');
          
          resolve({
            duration: parseFloat(metadata.format?.duration || 0),
            width: videoStream?.width || 0,
            height: videoStream?.height || 0,
            fps: this.parseFps(videoStream?.r_frame_rate),
            bitrate: parseInt(metadata.format?.bit_rate || 0),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Parse FPS from frame rate string (e.g., "30/1" -> 30)
   */
  private parseFps(frameRate: string): number {
    if (!frameRate) return 30;
    const parts = frameRate.split('/');
    if (parts.length === 2) {
      return parseInt(parts[0]) / parseInt(parts[1]);
    }
    return parseInt(frameRate) || 30;
  }

  /**
   * Transcode video to multiple qualities.
   *
   * NOTE: this no longer marks the video `failed` on error — it rethrows so the
   * BullMQ worker can retry, and the worker sets `failed` only after all
   * attempts are exhausted. Callers must go through the transcode queue.
   *
   * @param onProgress optional 0..100 progress reporter (queue → socket).
   *   Second arg `ready` fires once the playback proxy (720p, or 360p if the
   *   source is shorter than 720) exists so the player can open before 1080/4k.
   */
  async transcodeVideo(
    videoId: string,
    inputPath: string,
    onProgress?: (percent: number, status?: 'ready') => void,
  ): Promise<void> {
    this.logger.log(`Starting transcode for video ${videoId}`);

    const metadata = await this.getVideoMetadata(inputPath);
    this.logger.log(`Video metadata: ${JSON.stringify(metadata)}`);

    await this.videosService.updateStatus(videoId, 'processing', {
      duration: metadata.duration,
      width: metadata.width,
      height: metadata.height,
      fps: metadata.fps,
    });

    await this.generateThumbnail(inputPath, videoId);
    onProgress?.(5);

    // 720p first so review can start; 360p is the fallback proxy for <720 sources.
    const qualities = this.getQualitiesForVideo(metadata.height);
    let markedReady = false;

    const proxyFps = this.playbackFps(metadata.fps);

    for (let i = 0; i < qualities.length; i++) {
      const quality = qualities[i];
      try {
        await this.transcodeToQuality(inputPath, videoId, quality, proxyFps);
      } catch (err) {
        if (markedReady) {
          this.logger.error(
            `Background ${quality.name} failed after playback was ready: ${(err as Error).message}`,
          );
          continue;
        }
        throw err;
      }

      onProgress?.(Math.round(5 + ((i + 1) / qualities.length) * 95));

      if (!markedReady && (quality.name === '720p' || quality.name === '360p')) {
        await this.videosService.updateStatus(videoId, 'ready');
        markedReady = true;
        onProgress?.(Math.round(5 + ((i + 1) / qualities.length) * 95), 'ready');
        this.logger.log(`Playback ready for video ${videoId} after ${quality.name}`);
      }
    }

    if (!markedReady) {
      await this.videosService.updateStatus(videoId, 'ready');
      onProgress?.(100, 'ready');
    }
    this.logger.log(`Transcode completed for video ${videoId}`);
  }

  /**
   * Playback proxy first (720p, else 360p), then higher ladders in the background.
   */
  private getQualitiesForVideo(sourceHeight: number): Array<{
    name: string;
    height: number;
    bitrate: string;
    audioBitrate: string;
  }> {
    const all: Array<{
      name: string;
      height: number;
      bitrate: string;
      audioBitrate: string;
      minHeight: number;
    }> = [
      { name: '720p', height: 720, bitrate: '2500k', audioBitrate: '128k', minHeight: 720 },
      { name: '360p', height: 360, bitrate: '1000k', audioBitrate: '96k', minHeight: 0 },
      { name: '1080p', height: 1080, bitrate: '5000k', audioBitrate: '128k', minHeight: 1080 },
      { name: '4k', height: 2160, bitrate: '15000k', audioBitrate: '192k', minHeight: 2160 },
    ];
    return all
      .filter((q) => sourceHeight >= q.minHeight || q.name === '360p')
      .map(({ minHeight: _min, ...q }) => q);
  }

  /** Review proxy never exceeds 30 fps (Frame.io). GOP = 2s of that rate. */
  private playbackFps(sourceFps: number): number {
    if (!Number.isFinite(sourceFps) || sourceFps <= 0) return 30;
    return Math.min(Math.round(sourceFps), 30);
  }

  /**
   * Transcode video to specific quality
   */
  private async transcodeToQuality(
    inputPath: string,
    videoId: string,
    quality: { name: string; height: number; bitrate: string; audioBitrate: string },
    fps: number,
  ): Promise<void> {
    const outputPath = path.join(this.outputDir, videoId, `${quality.name}.mp4`);
    const outputDir = path.dirname(outputPath);
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const args = this.buildTranscodeArgs(inputPath, outputPath, quality, this.nvencUnavailable, fps);
    this.logger.log(`Transcoding to ${quality.name}: ffmpeg ${args.join(' ')}`);

    try {
      await this.runFfmpeg(args);
      return;
    } catch (err) {
      if (this.nvencUnavailable) throw err;
      this.logger.warn(
        `h264_nvenc failed for ${quality.name} (${(err as Error).message}) — falling back to libx264`,
      );
      this.nvencUnavailable = true;
      const cpuArgs = this.buildTranscodeArgs(inputPath, outputPath, quality, true, fps);
      this.logger.log(`Transcoding to ${quality.name}: ffmpeg ${cpuArgs.join(' ')}`);
      await this.runFfmpeg(cpuArgs);
    }
  }

  private buildTranscodeArgs(
    inputPath: string,
    outputPath: string,
    quality: { height: number; bitrate: string; audioBitrate: string },
    cpu: boolean,
    fps: number,
  ): string[] {
    const gop = Math.max(24, Math.round(fps * 2));
    const video = cpu
      ? ([
          '-c:v', 'libx264', '-preset', 'veryfast', '-b:v', quality.bitrate,
          '-g', String(gop), '-keyint_min', String(gop), '-sc_threshold', '0', '-bf', '0',
        ] as string[])
      : ([
          '-c:v', 'h264_nvenc', '-preset', 'p4', '-b:v', quality.bitrate,
          '-g', String(gop), '-bf', '0',
        ] as string[]);
    return [
      '-i', inputPath,
      '-vf', `fps=${fps},scale=-2:${quality.height}`,
      '-pix_fmt', 'yuv420p',
      ...video,
      '-c:a', 'aac',
      '-b:a', quality.audioBitrate,
      '-movflags', '+faststart',
      '-y',
      outputPath,
    ];
  }

  private runFfmpeg(args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = spawn(this.ffmpegPath, args);
      let stderr = '';
      const disarm = armProcessKillTimer(ffmpeg, this.transcodeTimeoutMs);
      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });
      ffmpeg.on('error', (err) => {
        disarm();
        reject(err);
      });
      ffmpeg.on('close', (code) => {
        disarm();
        if (code !== 0) {
          this.logger.error(`ffmpeg error: ${stderr.slice(-2000)}`);
          reject(new Error(`ffmpeg exited with code ${code}`));
          return;
        }
        resolve();
      });
    });
  }

  /**
   * Generate thumbnail from video
   */
  async generateThumbnail(inputPath: string, videoId: string): Promise<string> {
    const thumbnailDir = path.join(process.cwd(), 'uploads', 'thumbnails');
    if (!fs.existsSync(thumbnailDir)) {
      fs.mkdirSync(thumbnailDir, { recursive: true });
    }

    const thumbnailPath = path.join(thumbnailDir, `${videoId}.jpg`);

    return new Promise((resolve, reject) => {
      const args = [
        '-i', inputPath,
        '-ss', '00:00:01', // Take thumbnail at 1 second
        '-vframes', '1',
        '-vf', 'scale=320:-1',
        '-y',
        thumbnailPath,
      ];

      const ffmpeg = spawn(this.ffmpegPath, args);
      let stderr = '';
      const disarm = armProcessKillTimer(ffmpeg, 120_000);

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('error', (err) => {
        disarm();
        reject(err);
      });

      ffmpeg.on('close', (code) => {
        disarm();
        if (code !== 0) {
          this.logger.error(`Thumbnail generation error: ${stderr}`);
          reject(new Error(`ffmpeg exited with code ${code}`));
          return;
        }
        resolve(thumbnailPath);
      });
    });
  }
}