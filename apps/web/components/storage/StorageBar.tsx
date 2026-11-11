"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/stores/authStore";
import { useUploadStore } from "@/lib/stores/uploadStore";
import { refreshUsage } from "@/lib/refreshUsage";
import { formatBytes } from "@/lib/formatBytes";
import { cn } from "@/lib/utils";

/** Green below 80 %, amber below 100 %, red at or above. */
function barColor(percent: number): string {
  if (percent >= 100) return "bg-accent-red";
  if (percent >= 80) return "bg-accent-yellow";
  return "bg-accent-green";
}

export function StorageBar() {
  const user = useAuthStore((s) => s.user);
  // Changes whenever an upload starts, completes or fails, so usage is re-read at those moments.
  const uploadStates = useUploadStore((s) => s.tasks.map((t) => t.status).join(","));

  useEffect(() => {
    void refreshUsage();
  }, [uploadStates]);

  // Sessions stored before quotas existed have no usage fields until getMe answers.
  if (typeof user?.storageUsed !== "number") return null;

  const { storageUsed: used, storageQuota: quota } = user;
  const percent = quota === null || quota === undefined ? 0 : quota === 0 ? 100 : Math.min(100, (used / quota) * 100);

  return (
    <div className="px-4 pb-3">
      <p className="text-xs text-text-secondary mb-1.5">
        Đã dùng {formatBytes(used)} / {quota === null || quota === undefined ? "Không giới hạn" : formatBytes(quota)}
      </p>
      <div
        role="progressbar"
        aria-label="Dung lượng lưu trữ"
        aria-valuenow={used}
        aria-valuemin={0}
        aria-valuemax={quota ?? undefined}
        className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden"
      >
        <div className={cn("h-full transition-all duration-300", barColor(percent))} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}
