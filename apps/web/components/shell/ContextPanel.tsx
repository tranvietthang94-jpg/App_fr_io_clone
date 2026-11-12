"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PanelLeftClose, Search } from "lucide-react";
import { foldersApi, projectsApi } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VideoReviewStatus, type Folder, type Project } from "@r-frame/shared";

const FILTERS: { label: string; query: string; tone?: "success" | "destructive" }[] = [
  { label: "Tất cả video", query: "" },
  { label: "Đã duyệt", query: `?reviewStatus=${VideoReviewStatus.APPROVED}`, tone: "success" },
  { label: "Cần sửa", query: `?reviewStatus=${VideoReviewStatus.NEEDS_REVIEW}`, tone: "destructive" },
];

const linkClass = (active: boolean) =>
  cn(
    "block truncate rounded-md px-2 py-2 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
    active ? "bg-primary-soft font-medium text-primary" : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
  );

const SECTION_TITLE = "mb-2 mt-6 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted";

interface ContextPanelProps {
  projectId?: string;
  activeFolderId?: string | null;
  /** Given in the desktop layout; omitted inside the mobile drawer (it has its own close). */
  onCollapse?: () => void;
  /** Called after a link is followed, so the drawer can close. */
  onNavigate?: () => void;
  className?: string;
}

/** Project list (searchable) plus, inside a project, its top-level folders and clip filters. */
export function ContextPanel({ projectId, activeFolderId, onCollapse, onNavigate, className }: ContextPanelProps) {
  const pathname = usePathname();
  const [projects, setProjects] = useState<Project[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const activeRef = useRef<HTMLAnchorElement | null>(null);

  // ponytail: refetched per route change rather than pushed over a socket; a project created on
  // the same page shows up on the next navigation.
  useEffect(() => {
    let cancelled = false;
    projectsApi
      .getAll()
      .then((res) => !cancelled && setProjects(res.data))
      .catch(() => !cancelled && setProjects([]));
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  useEffect(() => {
    if (!projectId) {
      setFolders([]);
      return;
    }
    let cancelled = false;
    foldersApi
      .getByProject(projectId)
      .then((res) => !cancelled && setFolders(res.data))
      .catch(() => !cancelled && setFolders([]));
    return () => {
      cancelled = true;
    };
  }, [projectId, pathname]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [projects, projectId]);

  const q = query.trim().toLowerCase();
  const visible = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;

  return (
    <aside
      aria-label="Danh sách dự án"
      className={cn("flex h-full w-60 shrink-0 flex-col border-r border-border bg-bg-secondary", className)}
    >
      <div className="flex items-center gap-2 px-3 pb-2 pt-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            aria-label="Tìm dự án"
            placeholder="Tìm dự án"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8 w-full rounded border border-border bg-bg-primary pl-8 pr-2 text-sm text-text-primary placeholder-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>
        {onCollapse && (
          <button
            aria-label="Thu gọn danh sách dự án"
            title="Thu gọn ( [ )"
            onClick={onCollapse}
            className="rounded-md p-1.5 text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <PanelLeftClose className="h-4 w-4" />
          </button>
        )}
      </div>

      <div data-testid="project-list" className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        <p className="mb-2 px-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">Dự án</p>
        <nav aria-label="Dự án" className="space-y-0.5">
          {visible.map((p) => {
            const active = p.id === projectId;
            return (
              <Link
                key={p.id}
                ref={active ? activeRef : undefined}
                href={`/projects/${p.id}`}
                title={p.name}
                aria-current={active ? "page" : undefined}
                onClick={onNavigate}
                className={linkClass(active)}
              >
                {p.name}
              </Link>
            );
          })}
          {visible.length === 0 && <p className="px-2 py-2 text-sm text-text-muted">Không có dự án</p>}
        </nav>

        {projectId && folders.length > 0 && (
          <>
            <p className={SECTION_TITLE}>Thư mục</p>
            <nav aria-label="Thư mục" className="space-y-0.5">
              {folders.map((f) => (
                <Link
                  key={f.id}
                  href={`/projects/${projectId}?folder=${f.id}`}
                  title={f.name}
                  aria-current={activeFolderId === f.id ? "page" : undefined}
                  onClick={onNavigate}
                  className={linkClass(activeFolderId === f.id)}
                >
                  {f.name}
                </Link>
              ))}
            </nav>
          </>
        )}

        {projectId && (
          <>
            <p className={SECTION_TITLE}>Bộ lọc video</p>
            <nav aria-label="Bộ lọc video" className="space-y-0.5">
              {FILTERS.map((f) => (
                <Link
                  key={f.label}
                  href={`/projects/${projectId}${f.query}`}
                  onClick={onNavigate}
                  className={cn(
                    "block rounded-md px-2 py-1.5 text-sm hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                    f.tone === "success" ? "text-success" : f.tone === "destructive" ? "text-destructive-text" : "text-text-secondary hover:text-text-primary",
                  )}
                >
                  {f.label}
                </Link>
              ))}
            </nav>
          </>
        )}
      </div>
    </aside>
  );
}
