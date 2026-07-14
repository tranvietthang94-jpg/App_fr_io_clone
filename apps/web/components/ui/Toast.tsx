'use client';

import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, XCircle, Info, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type ToastVariant = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
}

interface ToastContextValue {
  toast: (item: Omit<ToastItem, 'id'>) => void;
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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (item: Omit<ToastItem, 'id'>) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { ...item, id }]);
      setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-full max-w-sm flex-col gap-2">
        {toasts.map((t) => {
          const Icon = VARIANT_ICON[t.variant];
          return (
            <div
              key={t.id}
              role="status"
              className={cn(
                'flex items-start gap-3 rounded-lg border bg-bg-secondary p-3 shadow-lg animate-slide-in',
                VARIANT_STYLES[t.variant]
              )}
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0" />
              <div className="flex-1 text-sm text-text-primary">
                <p className="font-medium">{t.title}</p>
                {t.description && (
                  <p className="mt-0.5 whitespace-pre-line text-text-secondary">{t.description}</p>
                )}
              </div>
              <button
                type="button"
                onClick={() => dismiss(t.id)}
                aria-label="Đóng thông báo"
                className="text-text-muted transition-colors hover:text-text-primary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
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
