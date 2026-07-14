"use client";

import { useState } from "react";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";
import { useToast } from "@/components/ui/Toast";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ProfileSettingsPage() {
  const { user, setUser } = useAuthStore();
  const toast = useToast();

  const [name, setName] = useState(user?.name || "");
  const [avatarUrl, setAvatarUrl] = useState(user?.avatarUrl || "");
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState("");

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      const res = await authApi.updateProfile({
        name: name.trim() || undefined,
        avatarUrl: avatarUrl.trim() || undefined,
      });
      setUser(res.data);
      toast({ variant: "success", title: "Đã lưu hồ sơ" });
    } catch (err: any) {
      toast({ variant: "error", title: err.response?.data?.message || "Lưu hồ sơ thất bại" });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError("");
    if (newPassword !== confirmPassword) {
      setPasswordError("Mật khẩu mới không khớp");
      return;
    }
    setChangingPassword(true);
    try {
      await authApi.changePassword(currentPassword, newPassword);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      toast({ variant: "success", title: "Đã đổi mật khẩu" });
    } catch (err: any) {
      setPasswordError(err.response?.data?.message || "Đổi mật khẩu thất bại");
    } finally {
      setChangingPassword(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <h1 className="text-2xl font-bold">Cài đặt tài khoản</h1>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Hồ sơ</h2>
        <form onSubmit={handleSaveProfile} className="space-y-4">
          <Input label="Tên hiển thị" value={name} onChange={(e) => setName(e.target.value)} />
          <Input
            label="URL ảnh đại diện"
            type="url"
            placeholder="https://..."
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
          />
          <Button type="submit" loading={savingProfile}>
            Lưu hồ sơ
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-semibold mb-4">Đổi mật khẩu</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          {passwordError && <p className="text-sm text-accent-red">{passwordError}</p>}
          <Input
            label="Mật khẩu hiện tại"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
          />
          <Input
            label="Mật khẩu mới"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            required
          />
          <Input
            label="Xác nhận mật khẩu mới"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
          />
          <Button type="submit" loading={changingPassword}>
            Đổi mật khẩu
          </Button>
        </form>
      </Card>
    </div>
  );
}
