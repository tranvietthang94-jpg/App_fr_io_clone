"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { notificationsApi, videosApi } from "@/lib/api";
import { socketService } from "@/lib/socket";
import { cn } from "@/lib/utils";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import type { Notification } from "@fr-clone/shared";

function describe(n: Notification): string {
  const actor = n.payload.actorName || "Ai đó";
  switch (n.type) {
    case "mention":
      return `${actor} đã nhắc đến bạn`;
    case "reply":
      return `${actor} đã trả lời bình luận của bạn`;
    case "resolve":
      return `${actor} đã xử lý bình luận`;
    case "reaction":
      return `${actor} đã bày tỏ cảm xúc với bình luận của bạn`;
    case "project_invite":
      return `${actor} đã mời bạn vào dự án`;
    default:
      return "Thông báo mới";
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = async () => {
    try {
      const res = await notificationsApi.getAll();
      setNotifications(res.data);
    } catch (err) {
      console.error("Failed to load notifications:", err);
    }
  };

  useEffect(() => {
    load();
    socketService.connect();
    const handleNew = (n: Notification) => setNotifications((prev) => [n, ...prev]);
    socketService.on("notification:new", handleNew);
    return () => socketService.off("notification:new", handleNew);
  }, []);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const handleClick = async (n: Notification) => {
    if (!n.read) {
      try {
        await notificationsApi.markRead(n.id);
        setNotifications((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      } catch (err) {
        console.error("Failed to mark notification read:", err);
      }
    }
    if (n.payload.videoId) {
      try {
        const res = await videosApi.getById(n.payload.videoId);
        router.push(`/projects/${res.data.projectId}/videos/${n.payload.videoId}`);
      } catch (err) {
        console.error("Failed to navigate to video:", err);
      }
    } else if (n.payload.inviteToken) {
      router.push(`/invite/${n.payload.inviteToken}`);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          aria-label="Thông báo"
          className="relative p-2 hover:bg-bg-tertiary rounded-md focus:outline-none focus:ring-2 focus:ring-accent-blue"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent-red text-white text-[10px] rounded-full flex items-center justify-center">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="max-h-96 overflow-y-auto">
          <div className="p-3 border-b border-border font-semibold text-sm">Thông báo</div>
          {notifications.length === 0 ? (
            <div className="p-4 text-sm text-text-secondary text-center">Chưa có thông báo</div>
          ) : (
            notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => handleClick(n)}
                className={cn(
                  "flex-col items-start gap-0.5 whitespace-normal rounded-none border-b border-border px-3 py-3 text-sm last:border-b-0",
                  !n.read && "bg-accent-blue/5"
                )}
              >
                <p>{describe(n)}</p>
                {n.payload.content && (
                  <p className="mt-1 w-full truncate text-xs text-text-muted">{n.payload.content}</p>
                )}
              </DropdownMenuItem>
            ))
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
