"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/Dialog";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { AlertTriangle, Trash2 } from "lucide-react";
import { formatBytes } from "@/lib/formatBytes";

interface ConfirmPermanentDeleteProps {
  name: string;
  kind: "video" | "folder";
  preview: { videoCount: number; totalBytes: number };
  /** Receives the typed name; the API checks it again, so this is not the only guard. */
  onConfirm: (confirmName: string) => Promise<void> | void;
  onClose: () => void;
}

/** Two steps: a warning with what will be lost, then the exact name typed (pasting is allowed). */
export function ConfirmPermanentDelete({ name, kind, preview, onConfirm, onClose }: ConfirmPermanentDeleteProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm(value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{kind === "folder" ? "Xoá vĩnh viễn thư mục" : "Xoá vĩnh viễn video"}</DialogTitle>
          <DialogDescription>
            {step === 1
              ? `Xoá vĩnh viễn ${preview.videoCount} video (${formatBytes(preview.totalBytes)}). Không thể khôi phục.`
              : `Thao tác này xoá cả file trên đĩa và giải phóng dung lượng.`}
          </DialogDescription>
        </DialogHeader>

        {step === 2 && (
          <Input
            autoFocus
            label={`Nhập chính xác tên "${name}" để xác nhận`}
            aria-label={`Nhập chính xác tên "${name}" để xác nhận`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Hủy
          </Button>
          {step === 1 ? (
            <Button variant="destructive" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setStep(2)}>
              Tiếp tục
            </Button>
          ) : (
            <Button variant="destructiveSolid" icon={<Trash2 className="h-4 w-4" />} disabled={value.trim() !== name} loading={busy} onClick={confirm}>
              Xoá vĩnh viễn
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
