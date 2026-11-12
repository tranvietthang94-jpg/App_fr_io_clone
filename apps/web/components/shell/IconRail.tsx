"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderOpen, LogOut, PanelLeftOpen, Settings, Shield, User } from "lucide-react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { StorageBar } from "@/components/storage/StorageBar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";

export type ShellSection = "projects" | "admin" | "settings";

// Shared with MobileNav so both navs stay in sync.
export const NAV_ITEMS: {
  key: ShellSection;
  href: string;
  label: string;
  icon: React.ElementType;
  adminOnly?: boolean;
}[] = [
  { key: "projects", href: "/projects", label: "Dự án", icon: FolderOpen },
  { key: "admin", href: "/admin", label: "Quản trị", icon: Shield, adminOnly: true },
  { key: "settings", href: "/settings/profile", label: "Cài đặt", icon: Settings },
];

export function useIsAdmin(): boolean {
  const user = useAuthStore((s) => s.user);
  return !!user && (user.isSuperAdmin || (user.adminPermissions?.length ?? 0) > 0);
}

export const ITEM_CLASS =
  "inline-flex h-10 w-10 items-center justify-center rounded-md transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";
export const itemTone = (active: boolean) =>
  active ? "bg-primary-soft text-primary" : "text-text-secondary hover:bg-bg-tertiary hover:text-text-primary";

export function AccountMenu({ side, className }: { side: "right" | "top"; className?: string }) {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  const handleLogout = () => {
    authApi.logout().catch(() => {});
    logout();
    router.push("/login");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label="Tài khoản" className={cn(ITEM_CLASS, itemTone(false), className)}>
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-soft text-primary">
            <User className="h-4 w-4" />
          </span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="w-64">
        <div className="px-2 py-2">
          <p className="truncate text-sm font-medium">{user?.name}</p>
          <p className="truncate text-xs text-text-secondary">{user?.email}</p>
        </div>
        <div className="-mx-1 pt-2">
          <StorageBar />
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/settings/profile">
            <User className="h-4 w-4" />
            Hồ sơ
          </Link>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={handleLogout}>
          <LogOut className="h-4 w-4" />
          Đăng xuất
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** Desktop (>= lg) 56px rail: primary destinations, notifications, storage and the account menu. */
export function IconRail({ active, onExpandPanel }: { active: ShellSection; onExpandPanel?: () => void }) {
  const isAdmin = useIsAdmin();

  // pb-16 keeps the account button clear of the Next dev-mode badge (bottom-left); harmless in production.
  return (
    <aside data-rail className="hidden w-14 shrink-0 flex-col items-center border-r border-border bg-bg-secondary pb-16 pt-3 lg:flex">
      <Link
        href="/projects"
        aria-label="R.Frame"
        className="mb-3 flex h-10 w-10 items-end justify-center gap-0.5 rounded-md pb-2 text-base font-bold tracking-tight focus:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
      >
        R<span className="mb-1 h-1.5 w-1.5 rounded-full bg-brand" aria-hidden />
      </Link>

      <nav aria-label="Điều hướng chính" className="flex flex-col items-center gap-1">
        {NAV_ITEMS.filter((i) => i.key === "projects").map((i) => (
          <RailLink key={i.key} item={i} active={active === i.key} />
        ))}
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <NotificationBell side="right" className={cn(ITEM_CLASS, itemTone(false))} />
            </span>
          </TooltipTrigger>
          <TooltipContent side="right">Thông báo</TooltipContent>
        </Tooltip>
        {isAdmin &&
          NAV_ITEMS.filter((i) => i.key === "admin").map((i) => (
            <RailLink key={i.key} item={i} active={active === i.key} />
          ))}
        {NAV_ITEMS.filter((i) => i.key === "settings").map((i) => (
          <RailLink key={i.key} item={i} active={active === i.key} />
        ))}
        {onExpandPanel && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                aria-label="Mở danh sách dự án"
                onClick={onExpandPanel}
                className={cn(ITEM_CLASS, itemTone(false))}
              >
                <PanelLeftOpen className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Mở danh sách dự án ( [ )</TooltipContent>
          </Tooltip>
        )}
      </nav>

      <div className="mt-auto flex flex-col items-center gap-2">
        <StorageBar compact />
        <AccountMenu side="right" />
      </div>
    </aside>
  );
}

function RailLink({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Link
          href={item.href}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={cn(ITEM_CLASS, itemTone(active))}
        >
          <Icon className="h-5 w-5" />
        </Link>
      </TooltipTrigger>
      <TooltipContent side="right">{item.label}</TooltipContent>
    </Tooltip>
  );
}
