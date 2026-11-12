"use client";

import { Suspense, useEffect } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";
import { UploadQueuePanel } from "@/components/upload/UploadQueuePanel";
import { IconRail, type ShellSection } from "@/components/shell/IconRail";
import { ContextPanel } from "@/components/shell/ContextPanel";
import { MobileNav } from "@/components/shell/MobileNav";
import { usePanelCollapsed } from "@/lib/shellState";

function isTypingTarget(t: EventTarget | null): boolean {
  const el = t as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
}

function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const [collapsed, setCollapsed] = usePanelCollapsed();

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.push("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  // `[` toggles the context panel, but never while typing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "[" || e.ctrlKey || e.metaKey || e.altKey || isTypingTarget(e.target)) return;
      setCollapsed(!collapsed);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [collapsed, setCollapsed]);

  if (!hasHydrated || !isAuthenticated) {
    return null;
  }

  const active: ShellSection = pathname.startsWith("/admin")
    ? "admin"
    : pathname.startsWith("/settings")
      ? "settings"
      : "projects";
  const projectId = pathname.match(/^\/projects\/([^/]+)/)?.[1];
  const activeFolderId = searchParams.get("folder");

  return (
    <div className="h-screen flex overflow-hidden">
      <IconRail active={active} onExpandPanel={collapsed ? () => setCollapsed(false) : undefined} />
      {!collapsed && (
        <div className="hidden lg:flex">
          <ContextPanel projectId={projectId} activeFolderId={activeFolderId} onCollapse={() => setCollapsed(true)} />
        </div>
      )}
      <MobileNav active={active} projectId={projectId} activeFolderId={activeFolderId}>
        <main className="flex-1 overflow-auto">{children}</main>
      </MobileNav>
      {/* Global upload progress — survives navigation between pages. */}
      <UploadQueuePanel />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // useSearchParams (the open folder) needs a Suspense boundary; the shell renders nothing before hydration anyway.
  return (
    <Suspense fallback={null}>
      <Shell>{children}</Shell>
    </Suspense>
  );
}
