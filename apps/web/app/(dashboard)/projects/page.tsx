"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { ProjectCard } from "@/components/dashboard/ProjectCard";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/Dialog";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { Plus, Folder } from "lucide-react";
import type { Project } from "@fr-clone/shared";

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [projectToDelete, setProjectToDelete] = useState<string | null>(null);

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

  const confirmDeleteProject = async () => {
    if (!projectToDelete) return;
    try {
      await projectsApi.delete(projectToDelete);
      setProjects((prev) => prev.filter((p) => p.id !== projectToDelete));
    } catch (err) {
      console.error("Failed to delete project:", err);
    } finally {
      setProjectToDelete(null);
    }
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-3xl font-bold">Dự án</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-6 space-y-4">
              <Skeleton className="h-12 w-12 rounded-lg" />
              <Skeleton className="h-5 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-3xl font-bold">Dự án</h1>
        <Button onClick={() => setShowCreateModal(true)} icon={<Plus className="w-5 h-5" />}>
          Tạo dự án mới
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-16">
          <Folder className="w-16 h-16 mx-auto text-text-secondary mb-4" />
          <h3 className="text-xl font-medium mb-2">Chưa có dự án nào</h3>
          <p className="text-text-secondary mb-6">
            Tạo dự án đầu tiên để bắt đầu review video
          </p>
          <Button size="lg" onClick={() => setShowCreateModal(true)}>
            Tạo dự án mới
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => router.push(`/projects/${project.id}`)}
              onDelete={() => setProjectToDelete(project.id)}
            />
          ))}
        </div>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tạo dự án mới</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateProject} className="space-y-4">
            <Input
              label="Tên dự án"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="Nhập tên dự án"
              autoFocus
            />
            <div>
              <label className="block text-sm font-medium mb-2 text-text-secondary">
                Mô tả (tùy chọn)
              </label>
              <textarea
                value={newProjectDesc}
                onChange={(e) => setNewProjectDesc(e.target.value)}
                className="input resize-none"
                placeholder="Mô tả dự án"
                rows={3}
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setShowCreateModal(false)}>
                Hủy
              </Button>
              <Button type="submit">Tạo</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={!!projectToDelete}
        onOpenChange={(open) => !open && setProjectToDelete(null)}
        title="Xóa dự án"
        description="Bạn có chắc muốn xóa dự án này? Hành động này không thể hoàn tác."
        confirmText="Xóa"
        variant="danger"
        onConfirm={confirmDeleteProject}
      />
    </div>
  );
}