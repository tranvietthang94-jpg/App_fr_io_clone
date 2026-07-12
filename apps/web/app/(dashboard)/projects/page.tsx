"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { formatRelativeTime } from "@/lib/utils";
import { Plus, Folder, MoreVertical, Trash2, Edit } from "lucide-react";
import type { Project } from "@fr-clone/shared";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const res = await projectsApi.getAll();
      setProjects(res.data);
    } catch (err) {
      console.error("Failed to load projects:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    try {
      const res = await projectsApi.create({
        name: newProjectName,
        description: newProjectDesc,
      });
      setProjects([res.data, ...projects]);
      setShowCreateModal(false);
      setNewProjectName("");
      setNewProjectDesc("");
    } catch (err) {
      console.error("Failed to create project:", err);
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (!confirm("Bạn có chắc muốn xóa dự án này?")) return;

    try {
      await projectsApi.delete(id);
      setProjects(projects.filter((p) => p.id !== id));
    } catch (err) {
      console.error("Failed to delete project:", err);
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
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dự án</h1>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors"
        >
          <Plus className="w-5 h-5" />
          <span>Tạo dự án mới</span>
        </button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <Folder className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-xl font-medium mb-2">Chưa có dự án nào</h3>
          <p className="text-muted-foreground mb-6">
            Tạo dự án đầu tiên để bắt đầu review video
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors"
          >
            Tạo dự án mới
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <div
              key={project.id}
              onClick={() => router.push(`/projects/${project.id}`)}
              className="bg-card border border-border rounded-lg p-6 cursor-pointer hover:border-primary/50 transition-colors group"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Folder className="w-6 h-6 text-primary" />
                </div>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteProject(project.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 p-2 hover:bg-secondary rounded-md transition-all"
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </button>
              </div>
              <h3 className="text-lg font-semibold mb-1 truncate">{project.name}</h3>
              {project.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {project.description}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                Cập nhật {formatRelativeTime(project.updatedAt)}
              </p>
            </div>
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-card border border-border rounded-lg p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Tạo dự án mới</h2>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Tên dự án
                </label>
                <input
                  type="text"
                  value={newProjectName}
                  onChange={(e) => setNewProjectName(e.target.value)}
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Nhập tên dự án"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-2">
                  Mô tả (tùy chọn)
                </label>
                <textarea
                  value={newProjectDesc}
                  onChange={(e) => setNewProjectDesc(e.target.value)}
                  className="w-full px-4 py-2 bg-secondary border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  placeholder="Mô tả dự án"
                  rows={3}
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="flex-1 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-primary-foreground rounded-md transition-colors"
                >
                  Tạo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}