import { Injectable, NotFoundException, BadRequestException, ForbiddenException, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs';
import * as path from 'path';
import { VideosService } from '../videos/videos.service';
import { TranscodeQueue } from '../media/transcode.queue';
import { ProjectsService } from '../projects/projects.service';
import { MemberRole } from '../projects/project-member.entity';

// parseInt(x) || fallback treats an explicit "0" the same as unset — an env
// var set to 0 (e.g. to reject all uploads) would be silently overridden.
function parseEnvInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === '') return fallback;
  const n = parseInt(value, 10);
  return Number.isNaN(n) ? fallback : n;
}

// Mirrors the client-side allowlist in apps/web/lib/uploadManager.ts.
const ALLOWED_MIME_TYPES = [
  'video/mp4',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/mpeg',
  'video/x-matroska',
];
const ALLOWED_EXTENSIONS = ['mp4', 'm4v', 'mov', 'mkv', 'webm', 'avi', 'mpeg', 'mpg'];

/**
 * Client-supplied filenames reach filesystem paths, so they must never carry
 * directory segments or separators (path traversal → arbitrary file write).
 * Everything the server stores/uses for path building goes through this.
 */
function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, '/')).replace(/[/:*?"<>|\x00-\x1f]/g, '_').trim();
  return base || 'video';
}

interface UploadMetadata {
  userId: string;
  projectId: string;
  filename: string;
  fileSize: number;
  totalChunks: number;
  chunkSize: number;
  assetGroupId?: string | null;
  folderId?: string | null;
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);
  private uploadDir = path.join(process.cwd(), 'uploads');
  private chunkDir = path.join(this.uploadDir, 'chunks');

  constructor(
    private videosService: VideosService,
    private transcodeQueue: TranscodeQueue,
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

    // Server-side type gate — the client allowlist is advisory only.
    const safeName = sanitizeFilename(filename);
    const ext = path.extname(safeName).slice(1).toLowerCase();
    const mimeOk = !mimeType || mimeType.startsWith('video/') || ALLOWED_MIME_TYPES.includes(mimeType);
    const extOk = !ext || ALLOWED_EXTENSIONS.includes(ext);
    if (!mimeOk || !extOk) {
      throw new BadRequestException('Chỉ hỗ trợ file video (mp4, m4v, mov, mkv, webm, avi, mpeg)');
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
      filename: safeName,
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
  async getUploadStatus(uploadId: string, userId: string) {
    const { metadata } = this.readUploadMetadata(uploadId);
    if (metadata.userId !== userId) {
      throw new ForbiddenException('Bạn không phải người tạo upload này');
    }
    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const uploadedChunks: number[] = [];
    for (let i = 0; i < metadata.totalChunks; i++) {
      if (fs.existsSync(path.join(uploadChunkDir, `chunk_${i}`))) {
        uploadedChunks.push(i);
      }
    }
    return { uploadId, totalChunks: metadata.totalChunks, chunkSize: metadata.chunkSize, uploadedChunks };
  }

  async uploadChunk(uploadId: string, chunkIndex: number, chunk: Buffer, userId: string) {
    const { metadata } = this.readUploadMetadata(uploadId);
    if (metadata.userId !== userId) {
      throw new ForbiddenException('Bạn không phải người tạo upload này');
    }
    if (!Number.isInteger(chunkIndex) || chunkIndex < 0 || chunkIndex >= metadata.totalChunks) {
      throw new BadRequestException(`chunkIndex phải trong khoảng 0..${metadata.totalChunks - 1}`);
    }

    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const chunkPath = path.join(uploadChunkDir, `chunk_${chunkIndex}`);
    fs.writeFileSync(chunkPath, chunk);

    return { success: true, chunkIndex };
  }

  /** Loads metadata.json for a (UUID-validated) uploadId, or 404s when unknown. */
  private readUploadMetadata(uploadId: string): { metadata: UploadMetadata } {
    const metadataPath = path.join(this.chunkDir, uploadId, 'metadata.json');
    if (!fs.existsSync(metadataPath)) {
      throw new NotFoundException('Upload not found');
    }
    return { metadata: JSON.parse(fs.readFileSync(metadataPath, 'utf-8')) };
  }

  async completeUpload(uploadId: string, userId: string, actorName: string) {
    const uploadChunkDir = path.join(this.chunkDir, uploadId);
    const { metadata } = this.readUploadMetadata(uploadId);
    const { projectId, fileSize, totalChunks, assetGroupId, folderId } = metadata;

    // Re-check role in case access changed since initUpload (e.g. removed from the project).
    await this.projectsService.assertRole(projectId, userId, MemberRole.EDITOR);

    // Defense in depth: metadata was written by initUpload which already
    // sanitized, but metadata.json is the path input here — never trust it.
    const filename = sanitizeFilename(metadata.filename);
    const finalPath = path.join(this.uploadDir, `${uploadId}_${filename}`);
    const writeStream = fs.createWriteStream(finalPath);

    // Pre-check so a missing chunk fails before a half-written file exists.
    const missing = [] as number[];
    for (let i = 0; i < totalChunks; i++) {
      if (!fs.existsSync(path.join(uploadChunkDir, `chunk_${i}`))) missing.push(i);
    }
    if (missing.length > 0) {
      writeStream.destroy();
      throw new BadRequestException(`Thiếu các chunk: ${missing.join(', ')}`);
    }

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(uploadChunkDir, `chunk_${i}`);
      const chunkData = fs.readFileSync(chunkPath);
      writeStream.write(chunkData);
    }

    writeStream.end();

    // Wait for write to complete
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

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

    // Hand off to the durable transcode queue instead of running ffmpeg inline.
    // A crash mid-transcode now leaves a recoverable Redis job rather than a
    // video stuck at `processing` forever.
    await this.transcodeQueue.enqueue(video.id, finalPath, userId);

    return video;
  }
}
