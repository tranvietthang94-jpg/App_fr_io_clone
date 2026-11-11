const GiB = 1024 ** 3;
const MiB = 1024 ** 2;

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

/** Same output as apps/api/src/storage/format-bytes.ts — quota messages built by the API must read identically here. */
export function formatBytes(bytes: number): string {
  return bytes >= GiB ? `${oneDecimal(bytes / GiB)} GB` : `${oneDecimal(bytes / MiB)} MB`;
}
