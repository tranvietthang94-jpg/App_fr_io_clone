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

/**
 * Parses a single `bytes=` range (RFC 7233). Returns null for a missing/malformed/multi-range header
 * (caller serves the full file), 'unsatisfiable' when it can't be served (caller sends 416).
 */
export function parseRange(header: string | undefined, fileSize: number): { start: number; end: number } | 'unsatisfiable' | null {
  const m = /^bytes=(\d*)-(\d*)$/.exec(header ?? '');
  if (!m || (!m[1] && !m[2])) return null;
  let start: number;
  let end: number;
  if (!m[1]) {
    // suffix range: the last N bytes
    const n = parseInt(m[2], 10);
    if (n === 0) return 'unsatisfiable';
    start = Math.max(0, fileSize - n);
    end = fileSize - 1;
  } else {
    start = parseInt(m[1], 10);
    end = m[2] ? Math.min(parseInt(m[2], 10), fileSize - 1) : fileSize - 1;
  }
  return start >= fileSize || start > end ? 'unsatisfiable' : { start, end };
}

/** Range-request-aware file stream response, shared by the authenticated and guest stream routes. */
export function streamVideoFile(filePath: string, req: Request, res: Response): void {
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const range = parseRange(req.headers.range, fileSize);

  if (range === 'unsatisfiable') {
    res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
    res.end();
  } else if (range) {
    const { start, end } = range;
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
