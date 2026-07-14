'use client';

import React, { useEffect, useRef } from 'react';
import * as AlertDialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { Button } from './Button';

interface AlertDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'default' | 'danger';
  loading?: boolean;
  onConfirm: () => void;
}

export function AlertDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Xác nhận',
  cancelText = 'Huỷ',
  variant = 'default',
  loading = false,
  onConfirm,
}: AlertDialogProps) {
  // Call sites open this via plain onClick handlers (setting `open` through
  // their own state), not Radix's <Trigger>, so Radix has no trigger element
  // to return focus to on close (its internal triggerRef stays null). Track
  // it ourselves so keyboard/screen-reader users land back where they were.
  const triggerElRef = useRef<Element | null>(null);
  useEffect(() => {
    if (open) triggerElRef.current = document.activeElement;
  }, [open]);

  return (
    <AlertDialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 animate-fade-in" />
        <AlertDialogPrimitive.Content
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            (triggerElRef.current as HTMLElement | null)?.focus?.();
          }}
          className={cn(
            'fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2',
            'rounded-lg border border-border bg-bg-secondary p-6 shadow-lg animate-slide-in focus:outline-none'
          )}
        >
          <div className="mb-4 flex flex-col gap-1">
            <AlertDialogPrimitive.Title className="text-lg font-semibold text-text-primary">
              {title}
            </AlertDialogPrimitive.Title>
            {description && (
              <AlertDialogPrimitive.Description className="text-sm text-text-secondary">
                {description}
              </AlertDialogPrimitive.Description>
            )}
          </div>
          <div className="mt-6 flex justify-end gap-3">
            <AlertDialogPrimitive.Cancel asChild disabled={loading}>
              <Button variant="ghost" disabled={loading}>
                {cancelText}
              </Button>
            </AlertDialogPrimitive.Cancel>
            <AlertDialogPrimitive.Action asChild>
              <Button
                variant={variant === 'danger' ? 'danger' : 'primary'}
                onClick={(e) => {
                  // Radix's Action closes the dialog on click by default — for an
                  // async onConfirm (delete calls etc.) we want the caller's
                  // onOpenChange(false) (already wired via the parent's state)
                  // to be the only thing that closes it, so loading states render.
                  e.preventDefault();
                  onConfirm();
                }}
                loading={loading}
              >
                {confirmText}
              </Button>
            </AlertDialogPrimitive.Action>
          </div>
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}
