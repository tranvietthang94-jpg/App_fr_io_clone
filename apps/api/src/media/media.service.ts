import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { VideosService } from '../videos/videos.service';

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);
  private readonly ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
  private readonly ffprobePath = process.env.FFPROBE_PATH || 'ffprobe';
  private readonly outputDir = path.join(process.cwd(), 'uploads', 'transcoded');

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

      ffprobe.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      ffprobe.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffprobe.on('close', (code) => {
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
   * Transcode video to multiple qualities
   */
  async transcodeVideo(videoId: string, inputPath: string): Promise<void> {
    this.logger.log(`Starting transcode for video ${videoId}`);

    try {
      // Get video metadata first
      const metadata = await this.getVideoMetadata(inputPath);
      this.logger.log(`Video metadata: ${JSON.stringify(metadata)}`);

      // Update video with metadata
      await this.videosService.updateStatus(videoId, 'processing', {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        fps: metadata.fps,
      });

      // Generate thumbnail
      await this.generateThumbnail(inputPath, videoId);

      // Transcode to different qualities
      const qualities = this.getQualitiesForVideo(metadata.height);
      
      for (const quality of qualities) {
        await this.transcodeToQuality(inputPath, videoId, quality);
      }

      // Mark as ready
      await this.videosService.updateStatus(videoId, 'ready');
      this.logger.log(`Transcode completed for video ${videoId}`);

    } catch (error: any) {
      this.logger.error(`Transcode failed for video ${videoId}: ${error.message}`);
      await this.videosService.updateStatus(videoId, 'failed');
      throw error;
    }
  }

  /**
   * Determine which qualities to generate based on source video height
   */
  private getQualitiesForVideo(sourceHeight: number): Array<{
    name: string;
    height: number;
    bitrate: string;
    audioBitrate: string;
  }> {
    const qualities: Array<{
      name: string;
      height: number;
      bitrate: string;
      audioBitrate: string;
    }> = [];

    if (sourceHeight >= 2160) {
      qualities.push({ name: '4k', height: 2160, bitrate: '15000k', audioBitrate: '192k' });
    }
    if (sourceHeight >= 1080) {
      qualities.push({ name: '1080p', height: 1080, bitrate: '5000k', audioBitrate: '128k' });
    }
    if (sourceHeight >= 720) {
      qualities.push({ name: '720p', height: 720, bitrate: '2500k', audioBitrate: '128k' });
    }
    // Always generate 360p
    qualities.push({ name: '360p', height: 360, bitrate: '1000k', audioBitrate: '96k' });

    return qualities;
  }

  /**
   * Transcode video to specific quality
   */
  private transcodeToQuality(
    inputPath: string,
    videoId: string,
    quality: { name: string; height: number; bitrate: string; audioBitrate: string },
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const outputPath = path.join(this.outputDir, videoId, `${quality.name}.mp4`);
      
      // Create output directory
      const outputDir = path.dirname(outputPath);
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const args = [
        '-i', inputPath,
        '-vf', `scale=-2:${quality.height}`,
        '-c:v', 'libx264',
        '-b:v', quality.bitrate,
        '-c:a', 'aac',
        '-b:a', quality.audioBitrate,
        '-movflags', '+faststart', // Enable streaming
        '-y', // Overwrite output
        outputPath,
      ];

      this.logger.log(`Transcoding to ${quality.name}: ffmpeg ${args.join(' ')}`);

      const ffmpeg = spawn(this.ffmpegPath, args);
      let stderr = '';

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
        if (code !== 0) {
          this.logger.error(`ffmpeg error: ${stderr}`);
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

      ffmpeg.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      ffmpeg.on('close', (code) => {
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