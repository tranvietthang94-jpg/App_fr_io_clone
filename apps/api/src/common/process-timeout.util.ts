import type { ChildProcess } from 'child_process';

/**
 * Kills a child process running on untrusted input (ffmpeg/ffprobe on
 * user-uploaded media) if it outlives `timeoutMs` — otherwise a crafted or
 * pathological file can hang a worker forever. Call the returned disarm
 * function from the process's close/error handlers.
 */
export function armProcessKillTimer(proc: ChildProcess, timeoutMs: number): () => void {
  const timer = setTimeout(() => {
    try {
      proc.kill('SIGKILL');
    } catch {
      // already exited — nothing to kill
    }
  }, timeoutMs);
  return () => clearTimeout(timer);
}
