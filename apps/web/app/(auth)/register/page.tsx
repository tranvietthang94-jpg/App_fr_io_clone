"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import { authApi } from "@/lib/api";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (formData.password !== formData.confirmPassword) {
      setError("Mật khẩu không khớp");
      return;
    }

    if (formData.password.length < 6) {
      setError("Mật khẩu phải có ít nhất 6 ký tự");
      return;
    }

    setLoading(true);

    try {
      const res = await authApi.register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
      });
      login(res.data.user, res.data.accessToken);
      router.push("/projects");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Đăng ký thất bại";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">Frame.io Clone</h1>
        <p className="mt-2 text-text-secondary">Tạo tài khoản mới</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-bg-secondary p-8 rounded-lg border border-border">
        {error && (
          <div className="bg-accent-red/10 border border-accent-red text-accent-red px-4 py-3 rounded">
            {error}
          </div>
        )}

        <Input
          id="name"
          type="text"
          label="Họ tên"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Nguyễn Văn A"
        />

        <Input
          id="email"
          type="email"
          label="Email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="your@email.com"
        />

        <Input
          id="password"
          type="password"
          label="Mật khẩu"
          required
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="••••••••"
        />

        <Input
          id="confirmPassword"
          type="password"
          label="Xác nhận mật khẩu"
          required
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          placeholder="••••••••"
        />

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "Đang đăng ký..." : "Đăng ký"}
        </Button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-secondary">hoặc</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <GoogleButton label="Đăng ký với Google" />

        <p className="text-center text-sm text-text-secondary">
          Đã có tài khoản?{" "}
          <Link href="/login" className="text-primary hover:underline">
            Đăng nhập
          </Link>
        </p>
      </form>
    </>
  );
}