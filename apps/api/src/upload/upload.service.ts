import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { VideosService } from '../videos/videos.service';
import { MediaService } from '../media/media.service';
import { ProjectsService } from '../projects/projects.service';
import { MemberRole } from '../projects/project-member.entity';

// parseInt(x) || fallback treats an explicit "0" the same as unset — an env
// var set to 0 (e.g. to reject all uploads) would be silently overridden.
function parseEnvInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private uploadDir = path.join(process.cwd(), 'uploads');
  private chunkDir = path.join(this.uploadDir, 'chunks');

  constructor(
    private videosService: VideosService,
    private mediaService: MediaService,
    private projectsService: ProjectsService,
  ) {
    // Create upload directories if they don't exist
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
    if (!fs.existsSync(this.chunkDir)) {
      fs.mkdirSync(this.chunkDir, { recursive: true });
    }
  }

  async initUpload(
    projectId: string,
    filename: string,
    fileSize: number,
    mimeType: string,
    userId: string,
    assetGroupId?: string,
    folderId?: string | null,
  ) {
    // Editor+ only — anyone with a valid JWT could otherwise upload into any
    // project just by guessing/knowing its id.
    await this.projectsService.assertRole(projectId, userId, MemberRole.EDITOR);

    const maxFileSize = parseEnvInt(process.env.MAX_FILE_SIZE, 5 * 1024 * 1024 * 1024);
    if (fileSize > maxFileSize) {
      throw new BadRequestException(`File vượt quá giới hạn ${maxFileSize} bytes`);
    }

    const uploadId = uuidv4();
    const chunkSize = parseEnvInt(process.env.UPLOAD_CHUNK_SIZE, 5 * 1024 * 1024);
    const totalChunks = Math.ceil(fileSize / chunkSize);

    // Create chunk directory for this upload
    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    fs.mkdirSync(uploadChunkDir, { recursive: true });

    // Store upload metadata. userId is re-checked against project membership
    // at completeUpload() too, in case access changes mid-upload.
    const metadata = {
      uploadId,
      projectId,
      filename,
      fileSize,
      mimeType,
      totalChunks,
      chunkSize,
      userId,
      assetGroupId: assetGroupId || null,
      folderId: folderId || null,
    };
    fs.writeFileSync(
      path.join(uploadChunkDir, 'metadata.json'),
      JSON.stringify(metadata),
    );

    return {
      uploadId,
      chunkSize,
      totalChunks,
    };
  }

  /** Which chunk indices already made it to disk — lets a client resume after a page refresh instead of restarting. */
  async getUploadStatus(uploadId: string) {
    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const metadataPath = path.join(uploadChunkDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new NotFoundException('Upload not found');
    }
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const uploadedChunks: number[] = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      if (fs.existsSync(path.join(uploadChunkDir, `chunk_${i}`))) {
        uploadedChunks.push(i);
      }
    }
    return { uploadId, totalChunks: metadata.totalChunks, chunkSize: metadata.chunkSize, uploadedChunks };
  }

  async uploadChunk(uploadId: string, chunkIndex: number, chunk: Buffer) {
    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    
    // Verify upload exists
    const metadataPath = path.join(uploadChunkDir, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new NotFoundException('Upload not found');
    }

    // Save chunk
    const chunkPath = path.join(uploadChunkDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, chunk);

    return { success: true, chunkIndex };
  }

  async completeUpload(uploadId: string, userId: string, actorName: string) {
    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const metadataPath = path.join(uploadChunkDir, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      throw new NotFoundException('Upload not found');
    }

    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));
    const { projectId, filename, fileSize, totalChunks, assetGroupId, folderId } = metadata;

    // Re-check role in case access changed since initUpload (e.g. removed from the project).
    await this.projectsService.assertRole(projectId, userId, MemberRole.EDITOR);

    // Combine chunks
    const finalPath = path.join(this.uploadDir, `${uploadId}_${filename}`);
    const writeStream = fs.createWriteStream(finalPath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(uploadChunkDir, `chunk_${i}`);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    writeStream.end();

    // Wait for write to complete
    await new Promise<void>((resolve) => writeStream.on('finish', resolve));

    // Create video record — a version upload (assetGroupId provided by the
    // client, e.g. "upload new version of this asset") gets the next
    // versionNumber in that group instead of starting a new one, and — unless
    // the client explicitly chose a different folder — inherits the previous
    // version's folder. Without this, a version upload that doesn't repeat
    // the folderId defaults to root while the max-versionNumber-per-group
    // query still treats it as "the" current version, making the asset
    // vanish from the folder it was actually organized into.
    let versionNumber: number | undefined;
    let resolvedFolderId = folderId;
    if (assetGroupId) {
      const latestVersion = await this.videosService.getLatestVersion(assetGroupId);
      versionNumber = (latestVersion?.versionNumber || 0) + 1;
      if (!folderId && latestVersion) {
        resolvedFolderId = latestVersion.folderId;
      }
    }
    const video = await this.videosService.create({
      projectId,
      title: filename,
      originalFilename: filename,
      filePath: finalPath,
      fileSize,
      folderId: resolvedFolderId,
      assetGroupId: assetGroupId || undefined,
      versionNumber,
      uploadedBy: { userId, actorName },
    });

    // Cleanup chunks
    fs.rmSync(uploadChunkDir, { recursive: true, force: true });

    // Trigger transcoding (async, don't wait)
    this.transcodeVideo(video.id, finalPath).catch(err => {
      this.logger.error(`Transcode failed: ${err.message}`);
    });

    return video;
  }

  private async transcodeVideo(videoId: string, filePath: string) {
    this.logger.log(`Starting transcode for video ${videoId}`);
    try {
      await this.mediaService.transcodeVideo(videoId, filePath);
      this.logger.log(`Transcode completed for video ${videoId}`);
    } catch (error: any) {
      this.logger.error(`Transcode error: ${error.message}`);
      await this.videosService.updateStatus(videoId, 'failed');
    }
  }
}
