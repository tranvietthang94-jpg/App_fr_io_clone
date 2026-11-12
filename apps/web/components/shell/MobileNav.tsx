"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { ContextPanel } from "./ContextPanel";
import { AccountMenu, ITEM_CLASS, NAV_ITEMS, itemTone, useIsAdmin, type ShellSection } from "./IconRail";

interface MobileNavProps {
  active: ShellSection;
  projectId?: string;
  activeFolderId?: string | null;
  children: React.ReactNode;
}

/** < lg: header with the drawer button, the page, and a bottom tab bar. Wraps the page content. */
export function MobileNav({ active, projectId, activeFolderId, children }: MobileNavProps) {
  const pathname = usePathname();
  const isAdmin = useIsAdmin();
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The drawer is opened by a plain button (not a Radix Trigger), so Radix has nothing to return focus to on close.
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  return (
    <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-3 border-b border-border px-4 py-3 lg:hidden">
        <button
          ref={menuButtonRef}
          onClick={() => setDrawerOpen(true)}
          aria-label="Mở menu"
          className="rounded-md p-2 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Link href="/projects" className="flex items-center gap-2">
          <span className="font-bold">
            R<span className="text-brand">.</span>Frame
          </span>
        </Link>
      </div>

      {children}

      <nav
        aria-label="Điều hướng dưới"
        className="flex shrink-0 items-center justify-around border-t border-border bg-bg-secondary px-2 py-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] lg:hidden"
      >
        {NAV_ITEMS.filter((i) => i.key === "projects").map((i) => (
          <TabLink key={i.key} item={i} active={active === i.key} />
        ))}
        <NotificationBell side="top" className={cn(ITEM_CLASS, itemTone(false))} />
        {isAdmin && NAV_ITEMS.filter((i) => i.key === "admin").map((i) => <TabLink key={i.key} item={i} active={active === i.key} />)}
        {NAV_ITEMS.filter((i) => i.key === "settings").map((i) => (
          <TabLink key={i.key} item={i} active={active === i.key} />
        ))}
        <AccountMenu side="top" />
      </nav>

      <DialogPrimitive.Root open={drawerOpen} onOpenChange={setDrawerOpen}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-black/60 animate-fade-in lg:hidden" />
          <DialogPrimitive.Content
            aria-describedby={undefined}
            onCloseAutoFocus={(e) => {
              e.preventDefault();
              menuButtonRef.current?.focus();
            }}
            className="fixed inset-y-0 left-0 z-50 w-[280px] max-w-[85vw] bg-bg-secondary shadow-[0_16px_48px_rgba(0,0,0,0.55)] focus:outline-none lg:hidden"
          >
            <DialogPrimitive.Title className="sr-only">Danh sách dự án</DialogPrimitive.Title>
            <ContextPanel
              projectId={projectId}
              activeFolderId={activeFolderId}
              onCollapse={() => setDrawerOpen(false)}
              onNavigate={() => setDrawerOpen(false)}
              className="w-full"
            />
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    </div>
  );
}

function TabLink({ item, active }: { item: (typeof NAV_ITEMS)[number]; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
      className={cn(ITEM_CLASS, itemTone(active))}
    >
      <Icon className="h-5 w-5" />
    </Link>
  );
}
