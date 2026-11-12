"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { adminApi, authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { formatBytes } from "@/lib/formatBytes";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import { Search } from "lucide-react";

const PAGE_SIZE = 50;
const SEARCH_DEBOUNCE_MS = 300;
const GiB = 1024 ** 3;

interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  avatarUrl: string | null;
  storageUsed: number;
  storageQuota: number | null; // effective; null = unlimited
  isCustomQuota: boolean;
  permissions: string[];
  isSuperAdmin: boolean;
  projectCount: number;
}

interface UserProject {
  id: string;
  name: string;
  role: string;
}

// Order and wording are fixed by the design; keys are the API's permission values.
const PERMISSION_LABELS: Array<[string, string]> = [
  ["quota_grant", "Cấp dung lượng"],
  ["quota_adjust", "Điều chỉnh dung lượng"],
  ["project_view", "Xem project"],
  ["project_interact", "Tương tác trong project (bình luận, duyệt)"],
  ["project_content", "Xoá / di chuyển / copy nội dung"],
];

/** Mirrors the API's rule so the checkboxes behave as expected; the API's normalize stays the source of truth. */
function applyDependency(current: string[], key: string, checked: boolean): string[] {
  const next = new Set(current);
  if (checked) {
    next.add(key);
    if (key === "project_interact" || key === "project_content") next.add("project_view");
  } else {
    next.delete(key);
    if (key === "project_view") {
      next.delete("project_interact");
      next.delete("project_content");
    }
  }
  return [...next];
}

const roleLabel = (u: AdminUserRow) => (u.isSuperAdmin ? "Super admin" : u.permissions.length > 0 ? "Admin" : "—");
const quotaLabel = (q: number | null) => (q === null ? "Không giới hạn" : formatBytes(q));

export default function AdminPage() {
  const router = useRouter();
  const toast = useToast();
  const me = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const [allowed, setAllowed] = useState(false);

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const isFirstSearch = useRef(true);

  // The stored session may predate the admin fields, so ask the server before deciding who may stay.
  useEffect(() => {
    authApi
      .getMe()
      .then((res) => {
        setUser(res.data);
        if (res.data.isSuperAdmin || res.data.adminPermissions?.length > 0) setAllowed(true);
        else router.replace("/projects");
      })
      .catch(() => router.replace("/projects"));
  }, [router, setUser]);

  const load = useCallback(async () => {
    try {
      const res = await adminApi.listUsers({ search: search || undefined, offset: page * PAGE_SIZE, limit: PAGE_SIZE });
      setItems(res.data.items);
      setTotal(res.data.total);
    } catch (err: any) {
      toast({ variant: "error", title: err.response?.data?.message || "Không tải được danh sách" });
    } finally {
      setLoading(false);
    }
  }, [search, page, toast]);

  useEffect(() => {
    if (!allowed) return;
    if (isFirstSearch.current) {
      isFirstSearch.current = false;
      void load();
      return;
    }
    const timer = setTimeout(() => void load(), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [allowed, load]);

  if (!allowed || !me) return null;

  const perms = me.adminPermissions ?? [];
  const selected = items.find((u) => u.id === selectedId) ?? null;
  const replaceRow = (row: AdminUserRow) => setItems((list) => list.map((u) => (u.id === row.id ? { ...u, ...row } : u)));
  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1);

  const recalculate = async () => {
    try {
      const res = await adminApi.recalculate();
      toast({ variant: "success", title: `Đã tính lại dung lượng cho ${res.data.users} người dùng` });
      await load();
    } catch (err: any) {
      toast({ variant: "error", title: err.response?.data?.message || "Tính lại thất bại" });
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-7xl mx-auto">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold">Quản trị</h1>
        {me.isSuperAdmin && (
          <Button variant="secondary" size="sm" onClick={recalculate}>
            Tính lại dung lượng
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section aria-label="Danh sách người dùng" className="min-w-0">
          <Input
            icon={<Search className="w-4 h-4" />}
            placeholder="Tìm theo tên hoặc email"
            aria-label="Tìm người dùng"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(0);
            }}
          />

          <div className="mt-4 rounded-lg border border-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-secondary text-left text-text-secondary">
                <tr>
                  <th className="px-3 py-2 font-medium">Người dùng</th>
                  <th className="px-3 py-2 font-medium">Đã dùng</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">Quota</th>
                  <th className="px-3 py-2 font-medium hidden sm:table-cell">Vai trò</th>
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="p-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                )}
                {!loading && items.length === 0 && (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-text-secondary">
                      Không có người dùng nào
                    </td>
                  </tr>
                )}
                {items.map((u) => {
                  const percent = u.storageQuota === null ? 0 : u.storageQuota === 0 ? 100 : Math.min(100, (u.storageUsed / u.storageQuota) * 100);
                  const isSelected = u.id === selectedId;
                  return (
                    <tr
                      key={u.id}
                      tabIndex={0}
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => setSelectedId(u.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(u.id);
                        }
                      }}
                      className={cn(
                        "border-t border-border cursor-pointer hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary",
                        isSelected && "bg-primary-soft",
                      )}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <Avatar src={u.avatarUrl ?? undefined} name={u.name} size="sm" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{u.name}</p>
                            <p className="text-xs text-text-secondary truncate">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 min-w-[110px]">
                        <p className="text-xs">{formatBytes(u.storageUsed)}</p>
                        <div className="h-1.5 mt-1 bg-bg-tertiary rounded-full overflow-hidden">
                          <div
                            className={cn("h-full", percent >= 100 ? "bg-destructive-solid" : percent >= 80 ? "bg-warning" : "bg-success")}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </td>
                      <td className="px-3 py-2.5 hidden sm:table-cell whitespace-nowrap">{quotaLabel(u.storageQuota)}</td>
                      <td className="px-3 py-2.5 hidden sm:table-cell">{roleLabel(u)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-text-secondary">
            <span>{total} người dùng</span>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>
                Trước
              </Button>
              <span>
                {page + 1} / {lastPage + 1}
              </span>
              <Button variant="ghost" size="sm" disabled={page >= lastPage} onClick={() => setPage(page + 1)}>
                Sau
              </Button>
            </div>
          </div>
        </section>

        <section aria-label="Chi tiết người dùng" className="min-w-0 rounded-lg border border-border bg-bg-secondary p-4 self-start">
          {selected ? (
            <UserDetail key={selected.id} user={selected} myId={me.id} myPerms={perms} isSuper={!!me.isSuperAdmin} onChange={replaceRow} />
          ) : (
            <p className="text-sm text-text-secondary">Chọn một người dùng để xem chi tiết.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function UserDetail({
  user,
  myId,
  myPerms,
  isSuper,
  onChange,
}: {
  user: AdminUserRow;
  myId: string;
  myPerms: string[];
  isSuper: boolean;
  onChange: (row: AdminUserRow) => void;
}) {
  const toast = useToast();
  const [gb, setGb] = useState(user.storageQuota === null ? "" : String(Math.round((user.storageQuota / GiB) * 100) / 100));
  const [busy, setBusy] = useState(false);
  const [projects, setProjects] = useState<UserProject[] | null>(null);
  const canView = myPerms.includes("project_view");

  useEffect(() => {
    if (!canView) return;
    adminApi
      .getUserProjects(user.id)
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]));
  }, [user.id, canView]);

  // Why the quota controls are off (null = usable). Mirrors the server's rules; the server enforces them.
  const quotaBlock = user.isSuperAdmin
    ? "Không thể đổi dung lượng của super admin"
    : user.id === myId
      ? "Không thể tự chỉnh dung lượng của mình"
      : null;
  const needed = user.isCustomQuota ? "quota_adjust" : "quota_grant";
  const saveBlock = quotaBlock ?? (myPerms.includes(needed) ? null : user.isCustomQuota ? "Cần quyền Điều chỉnh dung lượng" : "Cần quyền Cấp dung lượng");
  const resetBlock =
    quotaBlock ?? (!user.isCustomQuota ? "Đang dùng dung lượng mặc định" : myPerms.includes("quota_adjust") ? null : "Cần quyền Điều chỉnh dung lượng");

  const saveQuota = async (quotaBytes: number | null) => {
    setBusy(true);
    try {
      const res = await adminApi.updateQuota(user.id, quotaBytes);
      onChange(res.data);
      setGb(res.data.storageQuota === null || !res.data.isCustomQuota ? "" : String(Math.round((res.data.storageQuota / GiB) * 100) / 100));
      toast({ variant: "success", title: "Đã cập nhật dung lượng" });
    } catch (err: any) {
      toast({ variant: "error", title: err.response?.data?.message || "Cập nhật thất bại" });
    } finally {
      setBusy(false);
    }
  };

  const onSave = () => {
    const value = Number(gb);
    if (!gb.trim() || !Number.isFinite(value) || value < 0) {
      toast({ variant: "error", title: "Nhập dung lượng (GB) hợp lệ" });
      return;
    }
    void saveQuota(Math.round(value * GiB)); // the API wants integer bytes
  };

  const togglePermission = async (key: string, checked: boolean) => {
    setBusy(true);
    const next = applyDependency(user.permissions, key, checked);
    onChange({ ...user, permissions: next }); // optimistic; the server's normalized answer replaces it
    try {
      const res = await adminApi.updatePermissions(user.id, next);
      onChange(res.data);
    } catch (err: any) {
      onChange(user);
      toast({ variant: "error", title: err.response?.data?.message || "Cập nhật quyền thất bại" });
    } finally {
      setBusy(false);
    }
  };

  const permBlock = !isSuper ? "Chỉ super admin được chỉnh quyền" : user.isSuperAdmin ? "Super admin luôn có mọi quyền" : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 min-w-0">
        <Avatar src={user.avatarUrl ?? undefined} name={user.name} size="md" />
        <div className="min-w-0">
          <p className="font-semibold truncate">{user.name}</p>
          <p className="text-sm text-text-secondary truncate">{user.email}</p>
        </div>
      </div>

      <div>
        <h2 className="text-sm font-semibold mb-2">Dung lượng</h2>
        <p className="text-xs text-text-secondary mb-2">
          Đã dùng {formatBytes(user.storageUsed)} / {quotaLabel(user.storageQuota)}
          {!user.isCustomQuota && user.storageQuota !== null ? " (mặc định)" : ""}
        </p>
        <div className="flex flex-wrap items-end gap-2">
          <div className="w-32" title={quotaBlock ?? undefined}>
            <Input
              label="Dung lượng (GB)"
              aria-label="Dung lượng (GB)"
              type="number"
              min={0}
              step="any"
              value={gb}
              disabled={!!quotaBlock || busy}
              onChange={(e) => setGb(e.target.value)}
            />
          </div>
          <span title={saveBlock ?? undefined}>
            <Button size="md" disabled={!!saveBlock || busy} onClick={onSave}>
              Lưu dung lượng
            </Button>
          </span>
          <span title={resetBlock ?? undefined}>
            <Button variant="secondary" size="md" disabled={!!resetBlock || busy} onClick={() => saveQuota(null)}>
              Mặc định
            </Button>
          </span>
        </div>
        {saveBlock && <p className="mt-2 text-xs text-text-muted">{saveBlock}</p>}
      </div>

      <fieldset>
        <legend className="text-sm font-semibold mb-2">Quyền quản trị</legend>
        <div className="space-y-2" title={permBlock ?? undefined}>
          {PERMISSION_LABELS.map(([key, label]) => {
            const checked = user.isSuperAdmin || user.permissions.includes(key);
            return (
              <label key={key} className={cn("flex items-start gap-2 text-sm", permBlock ? "opacity-60" : "cursor-pointer")}>
                <input
                  type="checkbox"
                  className="mt-0.5 accent-primary"
                  checked={checked}
                  disabled={!!permBlock || busy}
                  onChange={(e) => void togglePermission(key, e.target.checked)}
                />
                <span>{label}</span>
              </label>
            );
          })}
        </div>
        {permBlock && <p className="mt-2 text-xs text-text-muted">{permBlock}</p>}
      </fieldset>

      <div>
        <h2 className="text-sm font-semibold mb-2">Dự án ({user.projectCount})</h2>
        {!canView ? (
          <p className="text-xs text-text-muted">Cần quyền Xem project</p>
        ) : projects === null ? (
          <Skeleton className="h-6 w-full" />
        ) : projects.length === 0 ? (
          <p className="text-xs text-text-secondary">Chưa tham gia dự án nào.</p>
        ) : (
          <ul className="space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="flex items-center justify-between gap-2 text-sm">
                <Link href={`/projects/${p.id}`} className="truncate text-primary hover:underline">
                  {p.name}
                </Link>
                <span className="text-xs text-text-secondary">{p.role}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
