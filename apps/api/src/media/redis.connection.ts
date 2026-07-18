/**
 * Connection options for BullMQ. We pass a plain options object (not a shared
 * ioredis instance) so BullMQ builds the connection with its own bundled
 * ioredis and owns its lifecycle — passing a top-level ioredis instance trips
 * a duplicate-package type/`instanceof` mismatch. `maxRetriesPerRequest: null`
 * is required by BullMQ's blocking commands.
 */
export function redisConnectionOptions() {
  const url = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
  return {
    host: url.hostname,
    port: Number(url.port) || 6379,
    username: url.username || undefined,
    password: url.password || undefined,
    maxRetriesPerRequest: null,
  };
}

export const TRANSCODE_QUEUE_NAME = 'transcode';
