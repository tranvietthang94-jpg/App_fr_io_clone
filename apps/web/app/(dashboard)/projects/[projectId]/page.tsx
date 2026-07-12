"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi, videosApi, uploadApi } from "@/lib/api";
import { formatRelativeTime, formatFileSize } from "@/lib/utils";
import {
  Upload,
  Film,
  MoreVertical,
  Trash2,
  Download,
  FileVideo,
} from "lucide-react";
import type { Project, Video } from "@fr-clone/shared";

export default function ProjectDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [project, setProject] = useState<Project | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  useEffect(() => {
    loadProject();
    loadVideos();
  }, [projectId]);

  const loadProject = async () => {
    try {
      const res = await projectsApi.getById(projectId);
      setProject(res.data);
    } catch (err) {
      console.error("Failed to load project:", err);
    }
  };

  const loadVideos = async () => {
    try {
      const res = await videosApi.getByProject(projectId);
      setVideos(res.data);
    } catch (err) {
      console.error("Failed to load videos:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadProgress(0);

    try {
      // Init upload
      const initRes = await uploadApi.init(
        projectId,
        file.name,
        file.size,
        file.type
      );
      const { uploadId, chunkSize } = initRes.data;

      // Upload chunks
      const totalChunks = Math.ceil(file.size / chunkSize);
      for (let i = 0; i < totalChunks; i++) {
        const start = i * chunkSize;
        const end = Math.min(start + chunkSize, file.size);
        const chunk = file.slice(start, end);

        await uploadApi.uploadChunk(uploadId, i, chunk);
        setUploadProgress(Math.round(((i + 1) / totalChunks) * 100));
      }

      // Complete upload
      await uploadApi.complete(uploadId);

      // Reload videos
      await loadVideos();
    } catch (err) {
      console.error("Upload failed:", err);
      alert("Upload thất bại. Vui lòng thử lại.");
    } finally {
      setUploading(false);
      setUploadProgress(0);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDeleteVideo = async (videoId: string) => {
    if (!confirm("Bạn có chắc muốn xóa video này?")) return;

    try {
      await videosApi.delete(videoId);
      setVideos(videos.filter((v) => v.id !== videoId));
    } catch (err) {
      console.error("Failed to delete video:", err);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="text-muted-foreground">Đang tải...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <button
            onClick={() => router.push("/projects")}
            className="text-sm text-muted-foreground hover:text-foreground mb-2"
          >
            ← Quay lại
          </button>
          <h1 className="text-3xl font-bold">{project?.name}</h1>
          {project?.description && (
            <p className="text-muted-foreground mt-1">{project.description}</p>
          )}
        </div>
        <div>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileSelect}
            accept="video/*"
            className="hidden"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors disabled:opacity-50"
          >
            <Upload className="w-5 h-5" />
            <span>{uploading ? `Đang upload ${uploadProgress}%` : "Upload video"}</span>
          </button>
        </div>
      </div>

      {/* Upload progress */}
      {uploading && (
        <div className="mb-6">
          <div className="h-2 bg-secondary rounded-full overflow-hidden">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${uploadProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Videos list */}
      {videos.length === 0 ? (
        <div className="text-center py-16">
          <FileVideo className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium mb-2">Chưa có video nào</h3>
          <p className="text-muted-foreground">
            Upload video đầu tiên để bắt đầu review
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {videos.map((video) => (
            <div
              key={video.id}
              onClick={() =>
                router.push(`/projects/${projectId}/videos/${video.id}`)
              }
              className="bg-card border border-border rounded-lg overflow-hidden cursor-pointer hover:border-primary/50 transition-colors group"
            >
              {/* Thumbnail */}
              <div className="aspect-video bg-secondary relative">
                {video.status === "processing" ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center">
                      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Đang xử lý...</p>
                    </div>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Film className="w-12 h-12 text-muted-foreground" />
                  </div>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold truncate flex-1">{video.title}</h3>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteVideo(video.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-secondary rounded transition-all"
                  >
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </button>
                </div>
                <div className="flex items-center gap-3 text-sm text-muted-foreground">
                  <span>{formatFileSize(video.fileSize)}</span>
                  <span>•</span>
                  <span>{formatRelativeTime(video.createdAt)}</span>
                </div>
                {video.status === "ready" && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs bg-green-500/10 text-green-500 rounded">
                    Sẵn sàng
                  </span>
                )}
                {video.status === "processing" && (
                  <span className="inline-block mt-2 px-2 py-1 text-xs bg-yellow-500/10 text-yellow-500 rounded">
                    Đang xử lý
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}