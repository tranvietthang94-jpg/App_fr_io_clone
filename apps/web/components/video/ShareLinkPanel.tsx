"use client";

import { useEffect, useState } from "react";
import { Link2, Copy, Trash2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { shareLinksApi } from "@/lib/api";
import { SharePermission, type ShareLink } from "@fr-clone/shared";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

const PERMISSION_LABELS: Record<SharePermission, string> = {
  [SharePermission.VIEW_ONLY]: "Chỉ xem",
  [SharePermission.CAN_COMMENT]: "Xem & bình luận",
};

interface ShareLinkPanelProps {
  videoId: string;
  onClose: () => void;
}

export function ShareLinkPanel({ videoId, onClose }: ShareLinkPanelProps) {
  const toast = useToast();
  const [links, setLinks] = useState<ShareLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [permission, setPermission] = useState<SharePermission>(SharePermission.CAN_COMMENT);
  const [expiresAt, setExpiresAt] = useState("");
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);

  const loadLinks = async () => {
    try {
      const res = await shareLinksApi.list(videoId);
      setLinks(res.data.filter((l: ShareLink) => !l.revokedAt));
    } catch (err) {
      console.error("Failed to load share links:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLinks();
  }, [videoId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      await shareLinksApi.create(videoId, {
        permission,
        expiresAt: expiresAt ? new Date(expiresAt).toISOString() : undefined,
        password: password.trim() || undefined,
      });
      setExpiresAt("");
      setPassword("");
      await loadLinks();
      toast({ variant: "success", title: "Đã tạo liên kết chia sẻ" });
    } catch (err: any) {
      toast({ variant: "error", title: err.response?.data?.message || "Tạo liên kết thất bại" });
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = (link: ShareLink) => {
    navigator.clipboard.writeText(`${APP_URL}/review/${link.token}`);
    toast({ variant: "success", title: "Đã sao chép liên kết" });
  };

  const handleRevoke = async (id: string) => {
    try {
      await shareLinksApi.revoke(id);
      setLinks((prev) => prev.filter((l) => l.id !== id));
      toast({ variant: "success", title: "Đã thu hồi liên kết" });
    } catch (err) {
      console.error("Failed to revoke share link:", err);
      toast({ variant: "error", title: "Thu hồi thất bại" });
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Chia sẻ video</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 mb-4 max-h-56 overflow-y-auto">
          {loading ? (
            <Skeleton className="h-12 w-full rounded-md" />
          ) : links.length === 0 ? (
            <p className="text-sm text-text-muted">Chưa có liên kết chia sẻ nào.</p>
          ) : (
            links.map((link) => (
              <div key={link.id} className="flex items-center gap-2 p-2 bg-bg-primary rounded-md">
                <Link2 className="w-4 h-4 text-accent-blue shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{PERMISSION_LABELS[link.permission]}</p>
                  {link.expiresAt && (
                    <p className="text-xs text-text-muted">
                      Hết hạn: {new Date(link.expiresAt).toLocaleString("vi-VN")}
                    </p>
                  )}
                </div>
                <button
                  onClick={() => handleCopy(link)}
                  aria-label="Sao chép liên kết"
                  className="p-1.5 hover:bg-bg-tertiary rounded-md"
                >
                  <Copy className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleRevoke(link.id)}
                  aria-label="Thu hồi liên kết"
                  className="p-1.5 hover:bg-bg-tertiary rounded-md text-accent-red"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={handleCreate} className="border-t border-border pt-4 space-y-3">
          <div className="flex gap-2">
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as SharePermission)}
              className="text-sm bg-bg-tertiary border border-border rounded-md px-2 flex-1"
            >
              <option value={SharePermission.CAN_COMMENT}>Xem & bình luận</option>
              <option value={SharePermission.VIEW_ONLY}>Chỉ xem</option>
            </select>
            <Input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              className="flex-1"
            />
          </div>
          <Input
            type="password"
            placeholder="Mật khẩu (tùy chọn)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button type="submit" loading={creating} className="w-full">
            Tạo liên kết chia sẻ
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
