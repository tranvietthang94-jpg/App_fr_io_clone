"use client";

import { useEffect, useState } from "react";
import { activityApi } from "@/lib/api";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { formatRelativeTime } from "@/lib/utils";
import { UploadCloud, CheckCircle, MessageSquare, UserPlus, UserMinus, Link2 } from "lucide-react";
import { ActivityType, type ActivityLogEntry } from "@fr-clone/shared";

const ACTIVITY_ICON: Record<ActivityType, React.ElementType> = {
  [ActivityType.VIDEO_UPLOADED]: UploadCloud,
  [ActivityType.REVIEW_STATUS_CHANGED]: CheckCircle,
  [ActivityType.COMMENT_ADDED]: MessageSquare,
  [ActivityType.MEMBER_ADDED]: UserPlus,
  [ActivityType.MEMBER_REMOVED]: UserMinus,
  [ActivityType.SHARE_LINK_CREATED]: Link2,
};

const REVIEW_STATUS_LABELS: Record<string, string> = {
  in_review: "Đang xem xét",
  approved: "Đã duyệt",
  needs_review: "Cần xem lại",
  rejected: "Từ chối",
};

function describeActivity(entry: ActivityLogEntry): string {
  const p = entry.payload as Record<string, any>;
  switch (entry.type) {
    case ActivityType.VIDEO_UPLOADED:
      return `đã tải lên "${p.videoTitle}"`;
    case ActivityType.REVIEW_STATUS_CHANGED:
      return `đã đổi trạng thái duyệt thành ${REVIEW_STATUS_LABELS[p.newStatus] || p.newStatus}`;
    case ActivityType.COMMENT_ADDED:
      return `đã bình luận: "${p.snippet}"`;
    case ActivityType.MEMBER_ADDED:
      return `đã mời ${p.memberEmail} (${p.role})`;
    case ActivityType.MEMBER_REMOVED:
      return `đã xóa ${p.memberEmail} khỏi dự án`;
    case ActivityType.SHARE_LINK_CREATED:
      return `đã tạo liên kết chia sẻ (${p.permission})`;
    default:
      return "đã thực hiện một hành động";
  }
}

interface ActivityFeedProps {
  projectId: string;
}

export function ActivityFeed({ projectId }: ActivityFeedProps) {
  const [entries, setEntries] = useState<ActivityLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(false);
  const PAGE_SIZE = 30;

  const load = async (before?: string) => {
    try {
      const res = await activityApi.getByProject(projectId, before);
      setEntries((prev) => (before ? [...prev, ...res.data] : res.data));
      setHasMore(res.data.length === PAGE_SIZE);
    } catch (err) {
      console.error("Failed to load activity:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [projectId]);

  const handleLoadMore = () => {
    const last = entries[entries.length - 1];
    if (last) load(new Date(last.createdAt).toISOString());
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-md" />
        ))}
      </div>
    );
  }

  if (entries.length === 0) {
    return <p className="text-sm text-text-muted">Chưa có hoạt động nào.</p>;
  }

  return (
    <div className="space-y-1">
      {entries.map((entry) => {
        const Icon = ACTIVITY_ICON[entry.type] || MessageSquare;
        return (
          <div key={entry.id} className="flex items-start gap-3 py-2 border-b border-border last:border-0">
            <div className="mt-0.5 w-7 h-7 rounded-full bg-bg-tertiary flex items-center justify-center shrink-0">
              <Icon className="w-3.5 h-3.5 text-text-secondary" />
            </div>
            <div className="flex-1 min-w-0 text-sm">
              <p className="text-text-primary">
                <span className="font-medium">{entry.actorName}</span> {describeActivity(entry)}
              </p>
              <p className="text-xs text-text-muted">{formatRelativeTime(entry.createdAt)}</p>
            </div>
          </div>
        );
      })}
      {hasMore && (
        <div className="pt-2 text-center">
          <Button variant="ghost" size="sm" onClick={handleLoadMore}>
            Tải thêm
          </Button>
        </div>
      )}
    </div>
  );
}
