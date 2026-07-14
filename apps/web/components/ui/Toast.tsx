'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import * as ToastPrimitive from '@radix-ui/react-toast';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
  open: boolean;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, 'id' | 'open'>) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const VARIANT_ICON: Record<ToastVariant, React.ElementType> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

const VARIANT_STYLES: Record<ToastVariant, string> = {
  success: 'border-accent-green/40 text-accent-green',
  error: 'border-accent-red/40 text-accent-red',
  info: 'border-accent-blue/40 text-accent-blue',
};

const AUTO_DISMISS_MS = 4000;
// Longest exit animation in tailwind.config.ts (fade-out is 0.2s, slide-out
// 0.15s) — the item must stay in the array at least this long after being
// flagged closed, or Root unmounts before the CSS animation gets to run.
const REMOVE_DELAY_MS = 200;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, open: false } : t)));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, REMOVE_DELAY_MS);
  }, []);

  const toast = useCallback((item: Omit<ToastItem, 'id' | 'open'>) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    setToasts((prev) => [...prev, { ...item, id, open: true }]);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      <ToastPrimitive.Provider duration={AUTO_DISMISS_MS} swipeDirection="right">
        {children}
        {toasts.map((t) => {
          const Icon = VARIANT_ICON[t.variant];
          return (
            <ToastPrimitive.Root
              key={t.id}
              open={t.open}
              onOpenChange={(open) => !open && dismiss(t.id)}
              className={cn(
                'flex items-start gap-3 rounded-lg border bg-bg-secondary p-3 shadow-lg',
                'data-[state=open]:animate-slide-in data-[state=closed]:animate-fade-out',
                'data-[swipe=move]:translate-x-[var(--radix-toast-swipe-move-x)]',
                'data-[swipe=cancel]:translate-x-0 data-[swipe=cancel]:transition-transform',
                'data-[swipe=end]:animate-slide-out',
                VARIANT_STYLES[t.variant]
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1 text-sm text-text-primary">
                <ToastPrimitive.Title className="font-medium">{t.title}</ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-0.5 whitespace-pre-line text-text-secondary">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close
                aria-label="Đóng thông báo"
                className="text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </ToastPrimitive.Close>
            </ToastPrimitive.Root>
          );
        })}
        <ToastPrimitive.Viewport className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2 outline-none" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return ctx.toast;
}
