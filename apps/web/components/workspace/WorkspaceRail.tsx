"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils";
import { VideoReviewStatus, type Project } from "@r-frame/shared";
import { Settings } from "lucide-react";

const FILTERS: { label: string; href: (projectId: string) => string; tone?: "green" | "red" }[] = [
  { label: "Tất cả clips", href: (id) => `/projects/${id}` },
  {
    label: "Đã duyệt",
    href: (id) => `/projects/${id}?reviewStatus=${VideoReviewStatus.APPROVED}`,
    tone: "green",
  },
  {
    label: "Cần sửa",
    href: (id) => `/projects/${id}?reviewStatus=${VideoReviewStatus.NEEDS_REVIEW}`,
    tone: "red",
  },
];

export function WorkspaceRail({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const user = useAuthStore((s) => s.user);
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    projectsApi
      .getAll()
      .then((res) => setProjects(res.data))
      .catch(() => setProjects([]));
  }, []);

  return (
    <aside className="hidden lg:flex w-[260px] shrink-0 flex-col border-r border-border bg-bg-secondary">
      <div className="px-4 py-4">
        <Link href="/projects" className="flex items-center gap-2">
          <span className="text-lg font-bold tracking-tight">
            R<span className="text-accent-green">.</span>Frame
          </span>
        </Link>
      </div>

      <div className="flex-1 overflow-y-auto px-3 pb-3">
        <p className="px-2 mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Dự án
        </p>
        <nav className="space-y-0.5">
          {projects.map((p) => {
            const active = p.id === projectId;
            return (
              <Link
                key={p.id}
                href={`/projects/${p.id}`}
                className={cn(
                  "block truncate rounded-md px-2 py-2 text-sm",
                  active
                    ? "bg-accent-green/10 text-accent-green font-medium"
                    : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary"
                )}
                title={p.name}
              >
                {p.name}
              </Link>
            );
          })}
        </nav>

        <p className="px-2 mt-6 mb-2 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
          Bộ lọc clip
        </p>
        <nav className="space-y-0.5">
          {FILTERS.map((f) => (
            <Link
              key={f.label}
              href={f.href(projectId)}
              className={cn(
                "block rounded-md px-2 py-1.5 text-sm text-text-secondary hover:bg-bg-tertiary hover:text-text-primary",
                f.tone === "green" && "text-accent-green",
                f.tone === "red" && "text-accent-red"
              )}
            >
              {f.label}
            </Link>
          ))}
        </nav>
      </div>

      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2 px-1">
          <div className="w-7 h-7 rounded-full bg-accent-green/20 flex items-center justify-center text-xs font-semibold text-accent-green">
            {(user?.name || "?").slice(0, 1).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user?.name}</p>
            <p className="text-[11px] text-text-muted truncate">Online</p>
          </div>
          <Link
            href="/settings/profile"
            aria-label="Cài đặt"
            className={cn(
              "p-1.5 rounded-md hover:bg-bg-tertiary",
              pathname.startsWith("/settings") && "text-accent-green"
            )}
          >
            <Settings className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </aside>
  );
}
