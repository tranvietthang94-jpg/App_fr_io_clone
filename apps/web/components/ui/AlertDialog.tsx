'use client';

import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from './Dialog';
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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose onOpenAutoFocus={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            {cancelText}
          </Button>
          <Button
            variant={variant === 'danger' ? 'danger' : 'primary'}
            onClick={onConfirm}
            loading={loading}
          >
            {confirmText}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
