import * as path from 'path';

/**
 * Client-supplied filenames reach filesystem paths, so they must never carry
 * directory segments or separators (path traversal -> arbitrary file write).
 * Everything the server stores/uses for path building goes through this.
 */
export function sanitizeFilename(filename: string): string {
  const base = path.basename(filename.replace(/\\/g, '/')).replace(/[/:*?"<>|\x00-\x1f]/g, '_').trim();
  return base || 'video';
}
