import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response } from 'express';

/** Rendition names produced by MediaService.getQualitiesForVideo — anything else in the URL is rejected, never joined into a path. */
const ALLOWED_QUALITIES = new Set(['original', '360p', '720p', '1080p', '4k']);

/** Resolves the on-disk path for a quality, falling back to the original file if a transcoded rendition is missing. */
export function resolveStreamFilePath(video: { id: string; filePath: string }, quality: string): string | null {
  if (!ALLOWED_QUALITIES.has(quality)) {
    return null;
  }
  let filePath: string;
  if (quality === 'original') {
    filePath = video.filePath;
  } else {
    filePath = path.join(process.cwd(), 'uploads', 'transcoded', video.id, `${quality}.mp4`);
  }
  if (!fs.existsSync(filePath)) {
    filePath = video.filePath;
  }
  return fs.existsSync(filePath) ? filePath : null;
}

/** Range-request-aware file stream response, shared by the authenticated and guest stream routes. */
export function streamVideoFile(filePath: string, req: Request, res: Response): void {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = Math.max(0, Math.min(parseInt(parts[0], 10) || 0, fileSize - 1));
    const end = parts[1] ? Math.min(parseInt(parts[1], 10) || fileSize - 1, fileSize - 1) : fileSize - 1;
    const chunksize = Math.max(1, end - start + 1);
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunksize,
      'Content-Type': 'video/mp4',
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': 'video/mp4',
      'Accept-Ranges': 'bytes',
    });
    fs.createReadStream(filePath).pipe(res);
  }
}
