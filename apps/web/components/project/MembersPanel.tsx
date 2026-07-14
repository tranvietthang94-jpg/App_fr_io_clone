"use client";

import { useEffect, useState } from "react";
import { UserPlus, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { useToast } from "@/components/ui/Toast";
import { projectMembersApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import type { ProjectMember, MemberRole } from "@fr-clone/shared";

interface MembersPanelProps {
  projectId: string;
  onClose: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  owner: "Chủ sở hữu",
  admin: "Quản trị viên",
  editor: "Biên tập viên",
  reviewer: "Người xem/duyệt",
};

const INVITABLE_ROLES: MemberRole[] = ["admin", "editor", "reviewer"] as MemberRole[];

export function MembersPanel({ projectId, onClose }: MembersPanelProps) {
  const { user } = useAuthStore();
  const toast = useToast();
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<MemberRole>("editor" as MemberRole);
  const [inviting, setInviting] = useState(false);
  const [error, setError] = useState("");
  const [removeTarget, setRemoveTarget] = useState<string | null>(null);

  const loadMembers = async () => {
    try {
      const res = await projectMembersApi.getMembers(projectId);
      setMembers(res.data);
    } catch (err) {
      console.error("Failed to load members:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, [projectId]);

  const myRole = members.find((m) => m.userId === user?.id)?.role;
  const canManage = myRole === "owner" || myRole === "admin";

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setError("");
    try {
      await projectMembersApi.invite(projectId, { email: inviteEmail.trim(), role: inviteRole });
      setInviteEmail("");
      await loadMembers();
    } catch (err: any) {
      setError(err.response?.data?.message || "Mời thất bại");
    } finally {
      setInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, role: string) => {
    try {
      await projectMembersApi.updateRole(projectId, memberId, role);
      await loadMembers();
    } catch (err) {
      console.error("Failed to update role:", err);
      toast({ variant: "error", title: "Cập nhật vai trò thất bại" });
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    try {
      await projectMembersApi.removeMember(projectId, removeTarget);
      setMembers((prev) => prev.filter((m) => m.id !== removeTarget));
      toast({ variant: "success", title: "Đã xóa thành viên" });
    } catch (err) {
      console.error("Failed to remove member:", err);
      toast({ variant: "error", title: "Xóa thành viên thất bại" });
    } finally {
      setRemoveTarget(null);
    }
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="flex max-h-[80vh] max-w-lg flex-col">
        <DialogHeader>
          <DialogTitle>Thành viên dự án</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-2 mb-4">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : (
            members.map((member) => (
              <div
                key={member.id}
                className="flex items-center gap-3 p-3 bg-bg-primary rounded-md"
              >
                <Avatar name={member.user?.name || member.invitedEmail || "?"} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {member.user?.name || member.invitedEmail}
                  </p>
                  <p className="text-xs text-text-muted">
                    {member.status === "pending" ? "Đang chờ chấp nhận" : member.user?.email}
                  </p>
                </div>
                {canManage && member.role !== "owner" ? (
                  <select
                    value={member.role}
                    onChange={(e) => handleRoleChange(member.id, e.target.value)}
                    className="text-xs bg-bg-tertiary border border-border rounded-md px-2 py-1"
                  >
                    {INVITABLE_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-text-secondary">{ROLE_LABELS[member.role]}</span>
                )}
                {canManage && member.role !== "owner" && (
                  <button
                    onClick={() => setRemoveTarget(member.id)}
                    aria-label="Xóa thành viên"
                    className="p-1.5 hover:bg-bg-tertiary rounded-md text-accent-red focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))
          )}
        </div>

        {canManage && (
          <form onSubmit={handleInvite} className="border-t border-border pt-4 space-y-2">
            {error && <p className="text-xs text-accent-red">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <div className="flex-1">
                <Input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="Email thành viên mới"
                />
              </div>
              <select
                value={inviteRole}
                onChange={(e) => setInviteRole(e.target.value as MemberRole)}
                className="text-sm bg-bg-tertiary border border-border rounded-md px-2"
              >
                {INVITABLE_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABELS[r]}
                  </option>
                ))}
              </select>
              <Button type="submit" size="sm" icon={<UserPlus className="w-4 h-4" />} loading={inviting}>
                Mời
              </Button>
            </div>
          </form>
        )}
      </DialogContent>

      <AlertDialog
        open={!!removeTarget}
        onOpenChange={(open) => !open && setRemoveTarget(null)}
        title="Xóa thành viên"
        description="Xóa thành viên này khỏi dự án?"
        confirmText="Xóa"
        variant="danger"
        onConfirm={handleConfirmRemove}
      />
    </Dialog>
  );
}
