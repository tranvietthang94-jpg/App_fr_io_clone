"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi, videosApi, foldersApi } from "@/lib/api";
import { uploadFileWithResume, validateVideoFile } from "@/lib/uploadManager";
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
  Folder as FolderIcon,
  FolderPlus,
  Trash2,
  RotateCcw,
  ChevronRight,
  Home,
  X,
} from "lucide-react";
import type { Project, Video, Folder } from "@fr-clone/shared";

type DeleteTarget = { type: "folder" | "video"; id: string };

interface UploadItem {
  id: string;
  name: string;
  progress: number;
  status: "uploading" | "done" | "error";
}

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
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
  const [uploadQueue, setUploadQueue] = useState<UploadItem[]>([]);
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);

  const currentFolderId = folderPath.length ? folderPath[folderPath.length - 1].id : null;

  useEffect(() => {
    loadProject();
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    loadFolders();
    loadVideos();
  }, [projectId, currentFolderId]);

  useEffect(() => {
    if (showTrash) loadTrash();
  }, [showTrash]);

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
      const res = await videosApi.getByProject(projectId, currentFolderId);
      setVideos(res.data);
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

  const uploadOneFile = async (file: File, assetGroupId?: string) => {
    const queueId = `${file.name}-${file.size}-${Date.now()}-${Math.random()}`;
    setUploadQueue((prev) => [...prev, { id: queueId, name: file.name, progress: 0, status: "uploading" }]);
    try {
      await uploadFileWithResume(
        file,
        projectId,
        { folderId: currentFolderId ?? undefined, assetGroupId },
        (percent) => {
          setUploadQueue((prev) => prev.map((u) => (u.id === queueId ? { ...u, progress: percent } : u)));
        }
      );
      setUploadQueue((prev) => prev.map((u) => (u.id === queueId ? { ...u, status: "done", progress: 100 } : u)));
      await loadVideos();
      setTimeout(() => setUploadQueue((prev) => prev.filter((u) => u.id !== queueId)), 3000);
    } catch (err) {
      console.error("Upload failed:", err);
      setUploadQueue((prev) => prev.map((u) => (u.id === queueId ? { ...u, status: "error" } : u)));
    }
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
      <div className="p-8">
        <Skeleton className="h-8 w-64 mb-2" />
        <Skeleton className="h-4 w-96 mb-8" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-4 space-y-3">
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
      className="p-8 relative min-h-full"
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

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <button
            onClick={() => router.push("/projects")}
            className="text-sm text-text-secondary hover:text-text-primary mb-2"
          >
            ← Quay lại
          </button>
          <h1 className="text-3xl font-bold">{project?.name}</h1>
          {project?.description && (
            <p className="text-text-secondary mt-1">{project.description}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<Users className="w-5 h-5" />} onClick={() => setShowMembers(true)}>
            Thành viên
          </Button>
          <Button
            variant="secondary"
            active={showTrash}
            icon={<Trash2 className="w-5 h-5" />}
            onClick={() => setShowTrash((v) => !v)}
          >
            Thùng rác
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
            Tải video lên
          </Button>
        </div>
      </div>

      {showMembers && (
        <MembersPanel projectId={projectId} onClose={() => setShowMembers(false)} />
      )}

      {newFolderOpen && (
        <form onSubmit={handleCreateFolder} className="flex items-center gap-2 mb-4">
          <div className="w-56">
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

      {/* Upload queue */}
      {uploadQueue.length > 0 && (
        <div className="mb-6 space-y-2">
          {uploadQueue.map((u) => (
            <div key={u.id} className="bg-bg-secondary border border-border rounded-md p-3">
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="truncate">{u.name}</span>
                <span className="text-text-secondary">
                  {u.status === "error" ? "Lỗi" : u.status === "done" ? "Xong" : `${u.progress}%`}
                </span>
              </div>
              <div className="h-1.5 bg-bg-tertiary rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-300 ${u.status === "error" ? "bg-accent-red" : "bg-primary"}`}
                  style={{ width: `${u.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
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
          <div className="flex items-center gap-1 text-sm mb-6 text-text-secondary">
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

          {/* Folders */}
          {folders.length > 0 && (
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
          {videos.length === 0 && folders.length === 0 ? (
            <div className="text-center py-16">
              <FileVideo className="w-16 h-16 mx-auto text-text-secondary mb-4" />
              <h3 className="text-xl font-medium mb-2">Chưa có video nào</h3>
              <p className="text-text-secondary">
                Tải video lên hoặc kéo-thả vào đây để bắt đầu duyệt
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {videos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  folders={folders}
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
