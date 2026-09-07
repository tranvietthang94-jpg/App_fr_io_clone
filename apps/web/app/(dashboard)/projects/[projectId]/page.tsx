"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { projectsApi, videosApi, foldersApi } from "@/lib/api";
import { validateVideoFile } from "@/lib/uploadManager";
import { useUploadStore } from "@/lib/stores/uploadStore";
import { socketService } from "@/lib/socket";
import { VideoCard } from "@/components/dashboard/VideoCard";
import { MembersPanel } from "@/components/project/MembersPanel";
import { Skeleton } from "@/components/ui/Skeleton";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { useToast } from "@/components/ui/Toast";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import {
  Upload,
  FileVideo,
  Users,
  Settings,
  Folder as FolderIcon,
  FolderPlus,
  Trash2,
  RotateCcw,
  ChevronRight,
  Home,
  Search,
  X,
} from "lucide-react";
import { VideoReviewStatus, type Project, type Video, type Folder } from "@r-frame/shared";

type DeleteTarget = { type: "folder" | "video"; id: string };

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const projectId = params.projectId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const [project, setProject] = useState<Project | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderPath, setFolderPath] = useState<Folder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showMembers, setShowMembers] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [trashVideos, setTrashVideos] = useState<Video[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [search, setSearch] = useState("");
  const [reviewStatusFilter, setReviewStatusFilter] = useState(
    () => searchParams.get("reviewStatus") || ""
  );
  const [transcodeProgress, setTranscodeProgress] = useState<Record<string, number>>({});
  // Stream token per video — powers the thumbnail <img> on each card.
  const [thumbTokens, setThumbTokens] = useState<Record<string, string>>({});

  const currentFolderId = folderPath.length ? folderPath[folderPath.length - 1].id : null;
  const isSearching = search.trim().length > 0;

  useEffect(() => {
    setReviewStatusFilter(searchParams.get("reviewStatus") || "");
  }, [searchParams]);

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    loadFolders();
  }, [projectId, currentFolderId]);

  useEffect(() => {
    setLoading(true);
    const timer = setTimeout(loadVideos, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [projectId, currentFolderId, search, reviewStatusFilter]);

  useEffect(() => {
    if (showTrash) loadTrash();
  }, [showTrash]);

  // Live transcode progress. The worker pushes to the uploader's personal room
  // (the socket is already connected app-wide by NotificationBell), so this
  // page updates without joining any video room — previously a card sat at
  // "Đang xử lý" until the user manually reloaded.
  useEffect(() => {
    const handleProgress = (data: { videoId: string; percent?: number; status?: string }) => {
      if (typeof data.percent === "number") {
        const percent = data.percent;
        setTranscodeProgress((prev) => ({ ...prev, [data.videoId]: percent }));
      }
      if (data.status === "ready" || data.status === "failed") {
        setTranscodeProgress((prev) => {
          const next = { ...prev };
          delete next[data.videoId];
          return next;
        });
        loadVideos();
      }
    };
    socketService.on("video:transcode-progress", handleProgress);
    return () => socketService.off("video:transcode-progress", handleProgress);
  }, [projectId, currentFolderId, search, reviewStatusFilter]);

  const loadProject = async () => {
    try {
      const res = await projectsApi.getById(projectId);
      setProject(res.data);
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };

  const loadFolders = async () => {
    try {
      const res = await foldersApi.getByProject(projectId, currentFolderId);
      setFolders(res.data);
    } catch (err) {
      console.error("Failed to load folders:", err);
    }
  };

  const loadVideos = async () => {
    try {
      const res = await videosApi.getByProject(projectId, currentFolderId, {
        search: search.trim() || undefined,
        reviewStatus: reviewStatusFilter || undefined,
      });
      setVideos(res.data);
      // Thumbnails are served with per-video stream tokens; mint them in one
      // request. Failure just means cards keep the film-icon fallback.
      if (res.data.some((v: Video) => v.status === "ready")) {
        try {
          const tokens = await videosApi.getStreamTokens(projectId);
          setThumbTokens(tokens.data);
        } catch (err) {
          console.error("Failed to load stream tokens:", err);
        }
      }
    } catch (err) {
      console.error("Failed to load videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const loadTrash = async () => {
    try {
      const res = await videosApi.getTrash(projectId);
      setTrashVideos(res.data);
    } catch (err) {
      console.error("Failed to load trash:", err);
    }
  };

  // Uploads run in the global store: navigating to another video/page (or the
  // whole project page unmounting) never touches them, and progress stays
  // visible in the floating panel mounted on the dashboard layout.
  const enqueueUpload = useUploadStore((s) => s.enqueue);

  const uploadOneFile = (file: File, assetGroupId?: string) => {
    enqueueUpload({
      file,
      projectId,
      assetGroupId,
      folderId: currentFolderId ?? undefined,
      onDone: () => {
        void loadVideos();
      },
    });
  };

  const handleFilesSelected = (fileList: FileList | File[]) => {
    const files = Array.from(fileList);
    const errors: string[] = [];
    const valid: File[] = [];
    for (const f of files) {
      const err = validateVideoFile(f);
      if (err) errors.push(err);
      else valid.push(f);
    }
    if (errors.length) {
      toast({ variant: "error", title: "File không hợp lệ", description: errors.join("\n") });
    }
    valid.forEach((f) => uploadOneFile(f));
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFilesSelected(e.target.files);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current = 0;
    setIsDragging(false);
    if (e.dataTransfer.files) handleFilesSelected(e.dataTransfer.files);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current++;
    if (e.dataTransfer.types.includes("Files")) setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    dragCounter.current--;
    if (dragCounter.current <= 0) setIsDragging(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    try {
      await foldersApi.create(projectId, { name: newFolderName.trim(), parentFolderId: currentFolderId ?? undefined });
      setNewFolderName("");
      setNewFolderOpen(false);
      await loadFolders();
      toast({ variant: "success", title: "Đã tạo thư mục" });
    } catch (err) {
      console.error("Failed to create folder:", err);
      toast({ variant: "error", title: "Tạo thư mục thất bại" });
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      if (deleteTarget.type === "folder") {
        await foldersApi.delete(projectId, deleteTarget.id);
        await loadFolders();
        toast({ variant: "success", title: "Đã xóa thư mục" });
      } else {
        await videosApi.delete(deleteTarget.id);
        setVideos((prev) => prev.filter((v) => v.id !== deleteTarget.id));
        toast({ variant: "success", title: "Đã xóa video" });
      }
    } catch (err) {
      console.error(`Failed to delete ${deleteTarget.type}:`, err);
      toast({
        variant: "error",
        title: deleteTarget.type === "folder" ? "Xóa thư mục thất bại" : "Xóa video thất bại",
      });
    } finally {
      setDeleteTarget(null);
    }
  };

  const handleRenameVideo = async (videoId: string, title: string) => {
    try {
      const res = await videosApi.rename(videoId, title);
      setVideos((prev) => prev.map((v) => (v.id === videoId ? res.data : v)));
      toast({ variant: "success", title: "Đã đổi tên video" });
    } catch (err) {
      console.error("Failed to rename video:", err);
      toast({ variant: "error", title: "Đổi tên thất bại" });
    }
  };

  const handleMoveVideo = async (videoId: string, folderId: string | null) => {
    try {
      await videosApi.move(videoId, folderId);
      setVideos((prev) => prev.filter((v) => v.id !== videoId));
      toast({ variant: "success", title: "Đã di chuyển video" });
    } catch (err) {
      console.error("Failed to move video:", err);
      toast({ variant: "error", title: "Di chuyển thất bại" });
    }
  };

  const handleUploadVersion = (video: Video, file: File) => {
    const err = validateVideoFile(file);
    if (err) {
      toast({ variant: "error", title: "Video không hợp lệ", description: err });
      return;
    }
    uploadOneFile(file, video.assetGroupId);
  };

  const handleRestore = async (videoId: string) => {
    try {
      await videosApi.restore(videoId);
      setTrashVideos((prev) => prev.filter((v) => v.id !== videoId));
      await loadVideos();
      toast({ variant: "success", title: "Đã khôi phục video" });
    } catch (err) {
      console.error("Failed to restore video:", err);
      toast({ variant: "error", title: "Khôi phục thất bại" });
    }
  };

  if (loading && !showTrash) {
    return (
      <div className="p-4 sm:p-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-bg-secondary border border-border rounded-lg overflow-hidden p-4 space-y-3">
              <Skeleton className="aspect-video w-full rounded-md" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div
      className="p-4 sm:p-8 relative min-h-full"
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="fixed inset-0 z-40 bg-primary/10 border-4 border-dashed border-primary flex items-center justify-center pointer-events-none">
          <div className="bg-bg-secondary px-8 py-6 rounded-lg border border-border text-center">
            <Upload className="w-10 h-10 mx-auto mb-2 text-primary" />
            <p className="font-medium">Thả file video để upload</p>
          </div>
        </div>
      )}

      {/* Header — flex-wrap so the 5-button action row drops to its own line
          instead of overflowing on narrow screens (same fix as the video
          review pages: a `justify-between` row with no wrap silently pushes
          items past the viewport rather than causing document scroll). */}
      <div className="flex flex-wrap items-center justify-between gap-y-3 mb-4">
        <div className="min-w-0">
          <button
            onClick={() => router.push("/projects")}
            className="text-sm text-text-secondary hover:text-text-primary mb-2"
          >
            ← Quay lại
          </button>
          <h1 className="text-3xl font-bold truncate max-w-[70vw] sm:max-w-none" title={project?.name}>{project?.name}</h1>
          {project?.description && (
            <p className="text-text-secondary mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            aria-label="Thành viên"
            icon={<Users className="w-5 h-5" />}
            onClick={() => setShowMembers(true)}
          >
            <span className="hidden sm:inline">Thành viên</span>
          </Button>
          <Button
            variant="secondary"
            aria-label="Cài đặt dự án"
            onClick={() => router.push(`/projects/${projectId}/settings`)}
          >
            <Settings className="w-5 h-5" />
          </Button>
          <Button
            variant="secondary"
            aria-label="Thùng rác"
            active={showTrash}
            icon={<Trash2 className="w-5 h-5" />}
            onClick={() => setShowTrash((v) => !v)}
          >
            <span className="hidden sm:inline">Thùng rác</span>
          </Button>
          <Button
            variant="secondary"
            aria-label="Tạo thư mục mới"
            onClick={() => setNewFolderOpen(true)}
          >
            <FolderPlus className="w-5 h-5" />
          </Button>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileInputChange}
            accept="video/*"
            multiple
            className="hidden"
          />
          <Button icon={<Upload className="w-5 h-5" />} onClick={() => fileInputRef.current?.click()}>
            <span className="hidden sm:inline">Tải video lên</span>
            <span className="sm:hidden">Tải lên</span>
          </Button>
        </div>
      </div>

      {showMembers && (
        <MembersPanel projectId={projectId} onClose={() => setShowMembers(false)} />
      )}

      {newFolderOpen && (
        <form onSubmit={handleCreateFolder} className="flex flex-wrap items-center gap-2 mb-4">
          <div className="w-full sm:w-56">
            <Input
              autoFocus
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Tên thư mục"
            />
          </div>
          <Button type="submit" size="sm">
            Tạo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label="Hủy tạo thư mục"
            onClick={() => {
              setNewFolderOpen(false);
              setNewFolderName("");
            }}
          >
            <X className="w-4 h-4" />
          </Button>
        </form>
      )}

      {showTrash ? (
        <div>
          <h2 className="text-lg font-semibold mb-4">Thùng rác</h2>
          {trashVideos.length === 0 ? (
            <div className="text-center py-16">
              <Trash2 className="w-16 h-16 mx-auto text-text-secondary mb-4" />
              <h3 className="text-xl font-medium mb-2">Thùng rác trống</h3>
              <p className="text-text-secondary">Video đã xóa sẽ xuất hiện ở đây</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {trashVideos.map((video) => (
                <div key={video.id} className="bg-bg-secondary border border-border rounded-lg p-4 flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{video.title}</p>
                    <p className="text-xs text-text-muted">Đã xóa</p>
                  </div>
                  <button
                    onClick={() => handleRestore(video.id)}
                    className="flex items-center gap-1 px-3 py-1.5 bg-primary/10 text-primary rounded-md text-sm hover:bg-primary/20"
                  >
                    <RotateCcw className="w-4 h-4" /> Khôi phục
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* Breadcrumb */}
          <div className="flex flex-wrap items-center gap-1 text-sm mb-6 text-text-secondary">
            <button
              onClick={() => setFolderPath([])}
              className={`flex items-center gap-1 hover:text-text-primary ${folderPath.length === 0 ? "text-text-primary font-medium" : ""}`}
            >
              <Home className="w-4 h-4" /> Gốc
            </button>
            {folderPath.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                <ChevronRight className="w-4 h-4" />
                <button
                  onClick={() => setFolderPath((prev) => prev.slice(0, i + 1))}
                  className={`hover:text-text-primary ${i === folderPath.length - 1 ? "text-text-primary font-medium" : ""}`}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>

          {/* Search & filter */}
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <div className="w-full sm:w-64">
              <Input
                icon={<Search className="w-4 h-4" />}
                placeholder="Tìm video theo tên..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <select
              value={reviewStatusFilter}
              onChange={(e) => {
                const value = e.target.value;
                setReviewStatusFilter(value);
                const next = new URLSearchParams(searchParams.toString());
                if (value) next.set("reviewStatus", value);
                else next.delete("reviewStatus");
                const qs = next.toString();
                router.replace(qs ? `/projects/${projectId}?${qs}` : `/projects/${projectId}`);
              }}
              className="text-sm bg-bg-tertiary border border-border rounded-md px-2 py-2"
            >
              <option value="">Mọi trạng thái duyệt</option>
              <option value={VideoReviewStatus.IN_REVIEW}>Đang xem xét</option>
              <option value={VideoReviewStatus.APPROVED}>Đã duyệt</option>
              <option value={VideoReviewStatus.NEEDS_REVIEW}>Cần xem lại</option>
              <option value={VideoReviewStatus.REJECTED}>Từ chối</option>
            </select>
            {isSearching && (
              <span className="text-xs text-text-muted">Kết quả tìm kiếm trong toàn bộ dự án</span>
            )}
          </div>

          {/* Folders (hidden while searching — search spans the whole project, not just this folder) */}
          {!isSearching && folders.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3 mb-6">
              {folders.map((folder) => (
                <div
                  key={folder.id}
                  onClick={() => setFolderPath((prev) => [...prev, folder])}
                  className="group flex items-center gap-2 p-3 bg-bg-secondary border border-border rounded-lg cursor-pointer hover:border-primary transition-colors"
                >
                  <FolderIcon className="w-5 h-5 text-accent-blue flex-shrink-0" />
                  <span className="text-sm truncate flex-1">{folder.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ type: "folder", id: folder.id });
                    }}
                    aria-label="Xóa thư mục"
                    className="opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 p-1 hover:bg-bg-tertiary rounded focus:outline-none focus:ring-2 focus:ring-accent-blue"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Videos list */}
          {videos.length === 0 && (isSearching || folders.length === 0) ? (
            <div className="text-center py-16">
              <FileVideo className="w-16 h-16 mx-auto text-text-secondary mb-4" />
              <h3 className="text-xl font-medium mb-2">
                {isSearching ? "Không tìm thấy video nào" : "Chưa có video nào"}
              </h3>
              {!isSearching && (
                <p className="text-text-secondary">
                  Tải video lên hoặc kéo-thả vào đây để bắt đầu duyệt
                </p>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  folders={folders}
                  progress={transcodeProgress[video.id] ?? null}
                  thumbnailUrl={videosApi.getThumbnailUrl(video.id, thumbTokens[video.id])}
                  onClick={() => router.push(`/projects/${projectId}/videos/${video.id}`)}
                  onDelete={() => setDeleteTarget({ type: "video", id: video.id })}
                  onRename={(title) => handleRenameVideo(video.id, title)}
                  onMove={(folderId) => handleMoveVideo(video.id, folderId)}
                  onUploadVersion={(file) => handleUploadVersion(video, file)}
                />
              ))}
            </div>
          )}
        </>
      )}

      <AlertDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={deleteTarget?.type === "folder" ? "Xóa thư mục" : "Xóa video"}
        description={
          deleteTarget?.type === "folder"
            ? "Xóa thư mục này? Video/thư mục con bên trong sẽ chuyển ra ngoài."
            : "Bạn có chắc muốn xóa video này? (có thể khôi phục từ Thùng rác)"
        }
        confirmText="Xóa"
        variant="danger"
        onConfirm={handleConfirmDelete}
      />
    </div>
  );
}
