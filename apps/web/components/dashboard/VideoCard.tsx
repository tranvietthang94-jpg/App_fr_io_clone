import React, { useRef, useState } from 'react';
import { Card } from '@/components/ui/Card';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from '@/components/ui/DropdownMenu';
import { Film, Trash2, CheckCircle, AlertCircle, XCircle, Loader2, MoreVertical, Edit2, UploadCloud, FolderInput } from 'lucide-react';
import { formatFileSize, formatRelativeTime } from '@/lib/utils';
import { VideoReviewStatus, type Video, type Folder } from '@fr-clone/shared';

interface VideoCardProps {
  video: Video;
  folders?: Folder[];
  /** Live transcode percent (0-100) pushed over the socket; null when unknown. */
  progress?: number | null;
  onClick?: () => void;
  onDelete?: () => void;
  onRename?: (newTitle: string) => void;
  onMove?: (folderId: string | null) => void;
  onUploadVersion?: (file: File) => void;
}

export const VideoCard: React.FC<VideoCardProps> = ({ video, folders = [], progress = null, onClick, onDelete, onRename, onMove, onUploadVersion }) => {
  const [renaming, setRenaming] = useState(false);
  const [titleInput, setTitleInput] = useState(video.title);
  const versionInputRef = useRef<HTMLInputElement>(null);

  const getStatusBadge = () => {
    switch (video.status) {
      case 'processing':
      case 'uploading':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-yellow/10 text-accent-yellow rounded-full text-xs">
            <Loader2 className="w-3 h-3 animate-spin" />
            <span>{progress === null ? 'Đang xử lý' : `Đang xử lý ${progress}%`}</span>
          </div>
        );
      case 'ready':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-green/10 text-accent-green rounded-full text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Sẵn sàng</span>
          </div>
        );
      case 'failed':
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-red/10 text-accent-red rounded-full text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Lỗi</span>
          </div>
        );
    }
  };

  const getReviewStatusBadge = () => {
    switch (video.reviewStatus) {
      case VideoReviewStatus.APPROVED:
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-green/10 text-accent-green rounded-full text-xs">
            <CheckCircle className="w-3 h-3" />
            <span>Đã duyệt</span>
          </div>
        );
      case VideoReviewStatus.NEEDS_REVIEW:
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-yellow/10 text-accent-yellow rounded-full text-xs">
            <AlertCircle className="w-3 h-3" />
            <span>Cần xem lại</span>
          </div>
        );
      case VideoReviewStatus.REJECTED:
        return (
          <div className="flex items-center gap-1 px-2 py-1 bg-accent-red/10 text-accent-red rounded-full text-xs">
            <XCircle className="w-3 h-3" />
            <span>Từ chối</span>
          </div>
        );
      default:
        return null;
    }
  };

  const submitRename = () => {
    if (titleInput.trim() && titleInput.trim() !== video.title) {
      onRename?.(titleInput.trim());
    }
    setRenaming(false);
  };

  return (
    <Card hover onClick={renaming ? undefined : onClick} className="group overflow-hidden relative">
      <div className="relative aspect-video bg-bg-tertiary overflow-hidden flex items-center justify-center">
        {video.status === 'processing' || video.status === 'uploading' ? (
          <div className="text-center w-32 max-w-[70%]">
            <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm text-text-muted">Đang xử lý...</p>
            {progress !== null && (
              <div
                className="mt-2 h-1 w-full bg-bg-hover rounded-full overflow-hidden"
                role="progressbar"
                aria-valuenow={progress}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label={`Tiến độ xử lý ${video.title}`}
              >
                <div className="h-full bg-primary transition-all duration-300" style={{ width: `${progress}%` }} />
              </div>
            )}
          </div>
        ) : (
          <Film className="w-12 h-12 text-text-muted" />
        )}
        <div className="absolute top-2 left-2 flex items-center gap-1">
          {getStatusBadge()}
          {getReviewStatusBadge()}
          {video.versionNumber > 1 && (
            <span className="px-2 py-1 bg-black/60 text-white rounded-full text-xs">v{video.versionNumber}</span>
          )}
        </div>

        {(onRename || onDelete || onMove || onUploadVersion) && (
          <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  onClick={(e) => e.stopPropagation()}
                  aria-label="Tùy chọn video"
                  className="p-1.5 bg-black/60 hover:bg-black/80 rounded focus:outline-none focus:ring-2 focus:ring-accent-blue"
                >
                  <MoreVertical className="w-4 h-4 text-white" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                {onRename && (
                  <DropdownMenuItem onSelect={() => setRenaming(true)}>
                    <Edit2 className="w-3.5 h-3.5" /> Đổi tên
                  </DropdownMenuItem>
                )}
                {onMove && (
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>
                      <FolderInput className="w-3.5 h-3.5" /> Di chuyển đến...
                    </DropdownMenuSubTrigger>
                    <DropdownMenuSubContent className="max-h-48 overflow-y-auto">
                      <DropdownMenuItem onSelect={() => onMove(null)}>
                        (Thư mục gốc)
                      </DropdownMenuItem>
                      {folders.map((f) => (
                        <DropdownMenuItem key={f.id} onSelect={() => onMove(f.id)}>
                          {f.name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuSubContent>
                  </DropdownMenuSub>
                )}
                {onUploadVersion && (
                  <DropdownMenuItem onSelect={() => versionInputRef.current?.click()}>
                    <UploadCloud className="w-3.5 h-3.5" /> Tải lên phiên bản mới
                  </DropdownMenuItem>
                )}
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem variant="danger" onSelect={onDelete}>
                      <Trash2 className="w-3.5 h-3.5" /> Xóa
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {onUploadVersion && (
              <input
                ref={versionInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) onUploadVersion(file);
                  e.target.value = '';
                }}
              />
            )}
          </div>
        )}
      </div>

      <div className="p-4">
        {renaming ? (
          <input
            autoFocus
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={submitRename}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submitRename();
              if (e.key === 'Escape') {
                setTitleInput(video.title);
                setRenaming(false);
              }
            }}
            className="w-full px-2 py-1 text-sm bg-bg-tertiary border border-primary rounded"
          />
        ) : (
          <h3 className="font-semibold text-text-primary truncate group-hover:text-accent-blue transition-colors">
            {video.title}
          </h3>
        )}
        <div className="flex items-center gap-3 mt-1 text-sm text-text-muted">
          <span>{formatFileSize(video.fileSize)}</span>
          <span>•</span>
          <span>{formatRelativeTime(video.createdAt)}</span>
        </div>
      </div>
    </Card>
  );
};
