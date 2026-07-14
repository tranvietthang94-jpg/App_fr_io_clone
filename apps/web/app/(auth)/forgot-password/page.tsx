"use client";

import { useState } from "react";
import Link from "next/link";
import { authApi } from "@/lib/api";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await authApi.forgotPassword(email);
    } finally {
      // Always show the same confirmation, whether or not the email exists.
      setSent(true);
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">Frame.io Clone</h1>
        <p className="mt-2 text-text-secondary">Quên mật khẩu</p>
      </div>

      <div className="space-y-6 bg-bg-secondary p-8 rounded-lg border border-border">
        {sent ? (
          <p className="text-sm text-text-secondary text-center">
            Nếu email này tồn tại trong hệ thống, chúng tôi đã gửi liên kết đặt lại mật khẩu.
            Vui lòng kiểm tra hộp thư.
          </p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <Input
              id="email"
              type="email"
              label="Email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
            />
            <Button type="submit" size="lg" className="w-full" loading={loading}>
              {loading ? "Đang gửi..." : "Gửi liên kết đặt lại"}
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
