"use client";

import { useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ResetPasswordPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (newPassword !== confirmPassword) {
      setError("Mật khẩu không khớp");
      return;
    }
    if (newPassword.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);
    try {
      await authApi.resetPassword(token, newPassword);
      setDone(true);
      setTimeout(() => router.push("/login"), 2000);
    } catch (err: any) {
      setError(err.response?.data?.message || "Liên kết không hợp lệ hoặc đã hết hạn");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">Frame.io Clone</h1>
        <p className="mt-2 text-text-secondary">Đặt lại mật khẩu</p>
      </div>

      <div className="space-y-6 bg-bg-secondary p-8 rounded-lg border border-border">
        {done ? (
          <p className="text-sm text-text-secondary text-center">
            Đặt lại mật khẩu thành công. Đang chuyển tới trang đăng nhập...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-accent-red/10 border border-accent-red text-accent-red px-4 py-3 rounded">
                {error}
              </div>
            )}
            <Input
              id="newPassword"
              type="password"
              label="Mật khẩu mới"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Input
              id="confirmPassword"
              type="password"
              label="Xác nhận mật khẩu mới"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="text-primary hover:underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </>
  );
}
