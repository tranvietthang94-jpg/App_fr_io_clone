import { uploadApi } from "./api";

export const ALLOWED_VIDEO_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-msvideo",
  "video/webm",
  "video/mpeg",
  "video/x-matroska",
];
export const MAX_CLIENT_FILE_SIZE = 30 * 1024 * 1024 * 1024; // mirrors the server's default MAX_FILE_SIZE

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

// A single 5MB chunk can be slow on weak home upstream — give it room, but
// never let a stalled connection hang the upload forever.
const CHUNK_TIMEOUT_MS = 180_000;
// Tolerate minutes of network trouble (laptop sleep, Wi-Fi switch, browser
// background throttling stalls) before giving up and marking the upload
// "Lỗi" — the server-side resume means retries never redo finished chunks.
const MAX_CHUNK_RETRIES = 8;
// Fill the Cloudflare tunnel: 1 stream leaves the pipe idle between parts.
// Server writes independent `chunk_N` files — 4 in flight is safe. Do not
// raise chunk size (Cloudflare request body). Bump this if the tunnel is still idle.
const UPLOAD_CONCURRENCY = 4;

async function mapPool<T>(items: T[], limit: number, fn: (item: T) => Promise<void>): Promise<void> {
  let i = 0;
  const n = Math.min(limit, items.length);
  if (n <= 0) return;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
      }
    }),
  );
}

async function uploadChunkWithRetry(uploadId: string, index: number, chunk: Blob): Promise<void> {
  for (let attempt = 0; ; attempt++) {
    try {
      await uploadApi.uploadChunk(uploadId, index, chunk, { timeout: CHUNK_TIMEOUT_MS });
      return;
    } catch (err) {
      if (attempt >= MAX_CHUNK_RETRIES) throw err;
      await sleep(Math.min(2000 * 2 ** attempt, 30000));
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

  await mapPool(remaining, UPLOAD_CONCURRENCY, async (i) => {
    const start = i * chunkSize!;
    const end = Math.min(start + chunkSize!, file.size);
    await uploadChunkWithRetry(uploadId!, i, file.slice(start, end));
    completedCount++;
    onProgress(Math.round((completedCount / totalChunks!) * 100));
  });

  const completeRes = await uploadApi.complete(uploadId!);
  localStorage.removeItem(key);
  return completeRes.data;
}
