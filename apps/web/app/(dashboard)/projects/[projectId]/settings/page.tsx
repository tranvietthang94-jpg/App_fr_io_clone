"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { projectsApi } from "@/lib/api";
import { useToast } from "@/components/ui/Toast";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { AlertDialog } from "@/components/ui/AlertDialog";
import { MembersPanel } from "@/components/project/MembersPanel";
import { ActivityFeed } from "@/components/project/ActivityFeed";
import { ArrowLeft, Users } from "lucide-react";
import type { Project } from "@r-frame/shared";

export default function ProjectSettingsPage() {
  const params = useParams();
  const router = useRouter();
  const toast = useToast();
  const projectId = params.projectId as string;

  const [project, setProject] = useState<Project | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    projectsApi
      .getById(projectId)
      .then((res) => {
        setProject(res.data);
        setName(res.data.name);
        setDescription(res.data.description || "");
      })
      .catch((err) => console.error("Failed to load project:", err));
  }, [projectId]);

  const handleSaveGeneral = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await projectsApi.update(projectId, {
        name: name.trim(),
        description: description.trim() || undefined,
      });
      setProject(res.data);
      toast({ variant: "success", title: "Đã lưu thay đổi" });
    } catch (err: any) {
      toast({ variant: "error", title: err.response?.data?.message || "Lưu thất bại" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      await projectsApi.delete(projectId);
      toast({ variant: "success", title: "Đã xóa dự án" });
      router.push("/projects");
    } catch (err) {
      console.error("Failed to delete project:", err);
      toast({ variant: "error", title: "Xóa dự án thất bại" });
    } finally {
      setConfirmDelete(false);
    }
  };

  if (!project) return null;

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <button
        onClick={() => router.push(`/projects/${projectId}`)}
        className="flex items-center gap-1 text-sm text-text-secondary hover:text-text-primary"
      >
        <ArrowLeft className="w-4 h-4" /> Quay lại dự án
      </button>
      <h1 className="text-2xl font-bold">Cài đặt dự án</h1>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Thông tin chung</h2>
        <form onSubmit={handleSaveGeneral} className="space-y-4">
          <Input label="Tên dự án" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Mô tả" value={description} onChange={(e) => setDescription(e.target.value)} />
          <Button type="submit" loading={saving}>
            Lưu thay đổi
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Thành viên</h2>
        <Button variant="secondary" icon={<Users className="w-5 h-5" />} onClick={() => setShowMembers(true)}>
          Quản lý thành viên
        </Button>
        {showMembers && <MembersPanel projectId={projectId} onClose={() => setShowMembers(false)} />}
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Hoạt động gần đây</h2>
        <ActivityFeed projectId={projectId} />
      </Card>

      <Card className="p-6 border-accent-red/30">
        <h2 className="font-semibold mb-2 text-accent-red">Vùng nguy hiểm</h2>
        <p className="text-sm text-text-secondary mb-4">
          Xóa dự án sẽ xóa vĩnh viễn toàn bộ video, bình luận và dữ liệu liên quan.
        </p>
        <Button variant="danger" onClick={() => setConfirmDelete(true)}>
          Xóa dự án
        </Button>
      </Card>

      <AlertDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Xóa dự án"
        description={`Bạn có chắc muốn xóa dự án "${project.name}"? Hành động này không thể hoàn tác.`}
        confirmText="Xóa"
        variant="danger"
        onConfirm={handleDelete}
      />
    </div>
  );
}
