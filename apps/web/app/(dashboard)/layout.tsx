"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import { authApi } from "@/lib/api";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { UploadQueuePanel } from "@/components/upload/UploadQueuePanel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  FolderOpen,
  LogOut,
  Settings,
  User,
  Menu,
  X,
} from "lucide-react";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout, hasHydrated } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    if (hasHydrated && !isAuthenticated) {
      router.push("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const isVideoWorkspace = /\/projects\/[^/]+\/videos\//.test(pathname);

  const handleLogout = () => {
    authApi.logout().catch(() => {});
    logout();
    router.push("/login");
  };

  if (!hasHydrated || !isAuthenticated) {
    return null;
  }

  return (
    <div className="h-screen flex overflow-hidden">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-border bg-bg-secondary transition-transform duration-200 lg:relative lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          isVideoWorkspace && "lg:hidden"
        )}
      >
        <div className="p-6 flex items-center justify-between">
          <Link href="/projects" className="flex items-center gap-2">
            <span className="inline-flex h-2 w-2 rounded-full bg-accent-green" aria-hidden />
            <span className="text-xl font-bold tracking-tight">R.Frame</span>
          </Link>
          <button
            onClick={() => setSidebarOpen(false)}
            aria-label="Đóng menu"
            className="p-1 rounded-md hover:bg-bg-tertiary lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 px-4">
          <Link
            href="/projects"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-md transition-colors",
              pathname === "/projects" || pathname.startsWith("/projects/")
                ? "bg-accent-green/10 text-accent-green"
                : "hover:bg-bg-tertiary"
            )}
          >
            <FolderOpen className="w-5 h-5" />
            <span>Dự án</span>
          </Link>
          <Link
            href="/settings/profile"
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-md transition-colors",
              pathname.startsWith("/settings")
                ? "bg-accent-green/10 text-accent-green"
                : "hover:bg-bg-tertiary"
            )}
          >
            <Settings className="w-5 h-5" />
            <span>Cài đặt</span>
          </Link>
        </nav>

        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3 px-4 py-2 mb-2">
            <div className="w-8 h-8 rounded-full bg-accent-green/20 flex items-center justify-center">
              <User className="w-4 h-4 text-accent-green" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{user?.name}</p>
              <p className="text-xs text-text-secondary truncate">{user?.email}</p>
            </div>
            <NotificationBell />
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start"
            icon={<LogOut className="w-5 h-5" />}
            onClick={handleLogout}
          >
            Đăng xuất
          </Button>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
          <button
            onClick={() => setSidebarOpen(true)}
            aria-label="Mở menu"
            className="p-2 rounded-md hover:bg-bg-tertiary"
          >
            <Menu className="w-5 h-5" />
          </button>
          <Link href="/projects" className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-accent-green" />
            <span className="font-bold">R.Frame</span>
          </Link>
        </div>
        <main className="flex-1 overflow-auto">{children}</main>
      </div>
      {/* Global upload progress — survives navigation between pages. */}
      <UploadQueuePanel />
    </div>
  );
}