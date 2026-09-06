"use client";

import { useState } from "react";
import { useUploadStore } from "@/lib/stores/uploadStore";
import { Upload, ChevronDown, X, RotateCcw, CheckCircle2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Floating upload-progress panel mounted on the dashboard layout — visible on
 * every page, so switching to another video/project never hides an in-flight
 * upload (the old queue lived inside the project page and vanished on
 * navigation, which read as "upload stopped").
 */
export function UploadQueuePanel() {
  const tasks = useUploadStore((s) => s.tasks);
  const retry = useUploadStore((s) => s.retry);
  const dismiss = useUploadStore((s) => s.dismiss);
  const [collapsed, setCollapsed] = useState(false);

  if (tasks.length === 0) return null;

  const uploading = tasks.filter((t) => t.status === "uploading").length;
  const hasError = tasks.some((t) => t.status === "error");

  if (collapsed) {
    return (
      <div className="fixed bottom-4 right-4 z-50">
        <button
          onClick={() => setCollapsed(false)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-full border border-border bg-bg-secondary shadow-lg text-sm",
            hasError ? "text-accent-red" : "text-text-primary"
          )}
        >
          {hasError ? <AlertCircle className="w-4 h-4" /> : <Upload className="w-4 h-4 animate-pulse" />}
          {uploading > 0 ? `Đang tải ${uploading} file...` : "Tải lên"}
        </button>
      </div>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-bg-secondary shadow-xl overflow-hidden">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Upload className="w-4 h-4 text-primary" />
          Tải lên ({tasks.length})
        </div>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Thu gọn"
          className="p-1 rounded hover:bg-bg-tertiary"
        >
          <ChevronDown className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-64 overflow-y-auto p-2 space-y-2">
        {tasks.map((t) => (
          <div key={t.id} className="bg-bg-primary border border-border rounded-md p-2.5">
            <div className="flex items-center gap-2 text-sm mb-1">
              {t.status === "done" && <CheckCircle2 className="w-4 h-4 text-accent-green flex-shrink-0" />}
              {t.status === "error" && <AlertCircle className="w-4 h-4 text-accent-red flex-shrink-0" />}
              <span className="truncate flex-1" title={t.name}>{t.name}</span>
              {t.status === "uploading" && (
                <button onClick={() => dismiss(t.id)} aria-label="Ẩn" className="p-0.5 rounded hover:bg-bg-tertiary">
                  <X className="w-3.5 h-3.5 text-text-secondary" />
                </button>
              )}
              {t.status === "done" && (
                <button onClick={() => dismiss(t.id)} aria-label="Ẩn" className="p-0.5 rounded hover:bg-bg-tertiary">
                  <X className="w-3.5 h-3.5 text-text-secondary" />
                </button>
              )}
            </div>
            {t.status === "error" && (
              <div className="flex items-center justify-between mt-1">
                <span className="text-xs text-accent-red">{t.errorMessage || "Lỗi"}</span>
                <button
                  onClick={() => retry(t.id)}
                  className="flex items-center gap-1 text-xs text-primary hover:underline"
                >
                  <RotateCcw className="w-3 h-3" /> Thử lại
                </button>
              </div>
            )}
            {t.status !== "error" && (
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className={cn("h-full transition-all duration-300", t.status === "done" ? "bg-accent-green" : "bg-primary")}
                  style={{ width: `${t.progress}%` }}
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
