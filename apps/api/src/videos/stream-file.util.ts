import * as fs from 'fs';
import * as path from 'path';
import type { Request, Response } from 'express';

/** Resolves the on-disk path for a quality, falling back to the original file if a transcoded rendition is missing. */
export function resolveStreamFilePath(video: { id: string; filePath: string }, quality: string): string | null {
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
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    const chunksize = end - start + 1;
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
