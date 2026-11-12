const GiB = 1024 ** 3;
const MiB = 1024 ** 2;
const KiB = 1024;

const oneDecimal = (n: number) => String(Math.round(n * 10) / 10);

export function formatBytes(bytes: number): string {
  if (bytes >= GiB) return `${oneDecimal(bytes / GiB)} GB`;
  if (bytes >= MiB) return `${oneDecimal(bytes / MiB)} MB`;
  return `${oneDecimal(bytes / KiB)} KB`;
}
