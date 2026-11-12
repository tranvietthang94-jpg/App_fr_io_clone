"use client";

import { useEffect, useState } from "react";
import { adminApi, foldersApi, projectsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { cn } from "@/lib/utils";
import type { Folder } from "@r-frame/shared";

interface TargetProject {
  id: string;
  name: string;
  hint?: string;
}

interface CopyMoveDialogProps {
  mode: "copy" | "move";
  sourceProjectId: string;
  /** The API refuses targets the caller has no CONTENT right in (403); the caller shows that as a toast. */
  onSubmit: (targetProjectId: string, targetFolderId: string | null) => Promise<void> | void;
  onClose: () => void;
}

export function CopyMoveDialog({ mode, sourceProjectId, onSubmit, onClose }: CopyMoveDialogProps) {
  const me = useAuthStore((s) => s.user);
  const canSearchAll = !!me && (me.isSuperAdmin || (me.adminPermissions ?? []).includes("project_content"));

  const [own, setOwn] = useState<TargetProject[]>([]);
  const [found, setFound] = useState<TargetProject[]>([]);
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<TargetProject | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    projectsApi
      .getAll()
      .then((res) => setOwn(res.data.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name }))))
      .catch(() => setOwn([]));
  }, []);

  // Admins with project_content can target any project; the list only offers what they search for.
  useEffect(() => {
    if (!canSearchAll || !search.trim()) {
      setFound([]);
      return;
    }
    const timer = setTimeout(() => {
      adminApi
        .searchProjects(search.trim())
        .then((res) => setFound(res.data.map((p: { id: string; name: string; ownerName: string }) => ({ id: p.id, name: p.name, hint: p.ownerName }))))
        .catch(() => setFound([]));
    }, 300);
    return () => clearTimeout(timer);
  }, [canSearchAll, search]);

  useEffect(() => {
    setFolderId(null);
    if (!target) {
      setFolders([]);
      return;
    }
    // ponytail: root-level folders only; a nested target folder needs a picker with drill-down.
    foldersApi
      .getByProject(target.id, null)
      .then((res) => setFolders(res.data))
      .catch(() => setFolders([]));
  }, [target]);

  const submit = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await onSubmit(target.id, folderId);
    } finally {
      setBusy(false);
    }
  };

  const shown = [...own, ...found.filter((f) => !own.some((o) => o.id === f.id))].filter(
    (p) => mode === "copy" || p.id !== sourceProjectId,
  );
  const verb = mode === "copy" ? "Copy" : "Di chuyển";

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{mode === "copy" ? "Copy sang project" : "Di chuyển sang project"}</DialogTitle>
          <DialogDescription>
            {mode === "copy"
              ? "Bản copy tính vào dung lượng của người đã upload file gốc."
              : "Mọi phiên bản của video được chuyển đi; dung lượng không đổi."}
          </DialogDescription>
        </DialogHeader>

        {canSearchAll && (
          <div className="mb-3">
            <Input placeholder="Tìm project khác..." aria-label="Tìm project" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
        )}

        <ul className="max-h-48 overflow-y-auto space-y-1" aria-label="Project đích">
          {shown.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => setTarget(p)}
                aria-pressed={target?.id === p.id}
                className={cn(
                  "w-full text-left px-3 py-2 rounded-md text-sm border border-transparent hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  target?.id === p.id && "bg-primary-soft border-primary/40 text-primary",
                )}
              >
                {p.name}
                {p.hint && <span className="ml-2 text-xs text-text-secondary">{p.hint}</span>}
              </button>
            </li>
          ))}
          {shown.length === 0 && <li className="text-sm text-text-secondary px-1">Không có project nào.</li>}
        </ul>

        {target && (
          <fieldset className="mt-4">
            <legend className="text-sm font-medium mb-1">Thư mục đích</legend>
            <div className="max-h-32 overflow-y-auto space-y-1">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="radio" className="accent-primary" name="target-folder" checked={folderId === null} onChange={() => setFolderId(null)} />
                (Thư mục gốc)
              </label>
              {folders.map((f) => (
                <label key={f.id} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input type="radio" className="accent-primary" name="target-folder" checked={folderId === f.id} onChange={() => setFolderId(f.id)} />
                  {f.name}
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          <Button disabled={!target} loading={busy} onClick={submit}>
            {verb}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
