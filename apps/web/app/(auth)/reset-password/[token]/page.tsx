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
      <div>
        <h1 className="text-3xl font-bold text-text-primary">
          R<span className="text-[#10B981]">.</span>Frame
        </h1>
        <p className="mt-2 text-sm text-text-secondary">Đặt lại mật khẩu</p>
      </div>

      <div className="space-y-6">
        {done ? (
          <p className="text-sm text-text-secondary text-center">
            Đặt lại mật khẩu thành công. Đang chuyển tới trang đăng nhập...
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div role="alert" className="bg-[#EF4444]/10 border border-[#EF4444] text-[#EF4444] px-4 py-3 rounded">
                {error}
              </div>
            )}
            <Input
              className="h-11 rounded-md border-border placeholder-[#64748B] focus:ring-[#10B981]/50 focus:border-[#10B981]"
              id="newPassword"
              type="password"
              label="Mật khẩu mới"
              required
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Input
              className="h-11 rounded-md border-border placeholder-[#64748B] focus:ring-[#10B981]/50 focus:border-[#10B981]"
              id="confirmPassword"
              type="password"
              label="Xác nhận mật khẩu mới"
              required
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="••••••••"
            />
            <Button type="submit" size="lg" className="w-full h-auto rounded-md px-6 py-3 text-base bg-[#10B981] text-white hover:bg-[#059669] active:bg-[#059669] focus-visible:ring-[#10B981]" loading={loading}>
              {loading ? "Đang xử lý..." : "Đặt lại mật khẩu"}
            </Button>
          </form>
        )}
        <p className="text-center text-sm text-text-secondary">
          <Link href="/login" className="text-[#10B981] font-medium hover:underline">
            Quay lại đăng nhập
          </Link>
        </p>
      </div>
    </>
  );
}
