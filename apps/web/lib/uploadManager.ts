import { uploadApi } from "./api";

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/mpeg",
  "video/x-matroska",
];
export const MAX_CLIENT_FILE_SIZE = 5 * 1024 * 1024 * 1024; // mirrors the server's default MAX_FILE_SIZE

export function validateVideoFile(file: File): string | null {
  const looksLikeVideo = file.type.startsWith("video/") || ALLOWED_VIDEO_TYPES.includes(file.type);
  if (!looksLikeVideo) {
    return `"${file.name}" không phải file video`;
  }
  if (file.size > MAX_CLIENT_FILE_SIZE) {
    return `"${file.name}" vượt quá giới hạn ${Math.round(MAX_CLIENT_FILE_SIZE / 1024 / 1024 / 1024)}GB`;
  }
  return null;
}

interface PendingUploadRecord {
  uploadId: string;
  chunkSize: number;
  totalChunks: number;
}

function pendingKey(projectId: string, file: File): string {
  return `frclone_upload_${projectId}_${file.name}_${file.size}_${file.lastModified}`;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function uploadChunkWithRetry(uploadId: string, index: number, chunk: Blob, maxRetries = 4): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await uploadApi.uploadChunk(uploadId, index, chunk);
      return;
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      await sleep(Math.min(1000 * 2 ** attempt, 10000));
    }
  }
}

export interface UploadOptions {
  assetGroupId?: string;
  folderId?: string;
}

/**
 * Uploads a file in chunks, resuming from wherever a previous attempt for
 * this exact file (name+size+lastModified) left off — the browser can't
 * persist the File object across a refresh, so "resume" here means: the
 * user re-selects the same file, and we skip chunks the server already has
 * instead of re-uploading from scratch.
 */
export async function uploadFileWithResume(
  file: File,
  projectId: string,
  opts: UploadOptions,
  onProgress: (percent: number) => void,
): Promise<any> {
  const key = pendingKey(projectId, file);
  let pending: PendingUploadRecord | null = null;
  const stored = localStorage.getItem(key);
  if (stored) {
    try {
      pending = JSON.parse(stored);
    } catch {
      pending = null;
    }
  }

  let uploadId: string;
  let chunkSize: number;
  let totalChunks: number;
  let alreadyUploaded = new Set<number>();

  if (pending) {
    try {
      const status = await uploadApi.getStatus(pending.uploadId);
      uploadId = pending.uploadId;
      chunkSize = status.data.chunkSize;
      totalChunks = status.data.totalChunks;
      alreadyUploaded = new Set(status.data.uploadedChunks);
    } catch {
      // The server-side upload session is gone (expired/cleaned up) — start fresh.
      localStorage.removeItem(key);
      pending = null;
    }
  }

  if (!pending) {
    const initRes = await uploadApi.init(projectId, file.name, file.size, file.type, opts);
    uploadId = initRes.data.uploadId;
    chunkSize = initRes.data.chunkSize;
    totalChunks = initRes.data.totalChunks;
    localStorage.setItem(key, JSON.stringify({ uploadId, chunkSize, totalChunks }));
  }

  const remaining: number[] = [];
  for (let i = 0; i < totalChunks!; i++) {
    if (!alreadyUploaded.has(i)) remaining.push(i);
  }

  let completedCount = totalChunks! - remaining.length;
  onProgress(Math.round((completedCount / totalChunks!) * 100));

  for (const i of remaining) {
    const start = i * chunkSize!;
    const end = Math.min(start + chunkSize!, file.size);
    const chunk = file.slice(start, end);
    await uploadChunkWithRetry(uploadId!, i, chunk);
    completedCount++;
    onProgress(Math.round((completedCount / totalChunks!) * 100));
  }

  const completeRes = await uploadApi.complete(uploadId!);
  localStorage.removeItem(key);
  return completeRes.data;
}
