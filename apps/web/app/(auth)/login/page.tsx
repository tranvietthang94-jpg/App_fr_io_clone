"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import { authApi } from "@/lib/api";
import { GoogleButton } from "@/components/auth/GoogleButton";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";

const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  google_not_configured: "Đăng nhập với Google chưa được cấu hình trên máy chủ này.",
  google_failed: "Đăng nhập với Google thất bại. Vui lòng thử lại.",
};

// useSearchParams() requires a Suspense boundary during static prerendering;
// isolated here so it doesn't force the rest of the page into a client-only bailout.
function OAuthErrorFromQuery({ onError }: { onError: (message: string) => void }) {
  const searchParams = useSearchParams();

  useEffect(() => {
    const oauthError = searchParams.get("error");
    if (oauthError) {
      onError(OAUTH_ERROR_MESSAGES[oauthError] || "Đăng nhập với Google thất bại. Vui lòng thử lại.");
    }
  }, [searchParams, onError]);

  return null;
}

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAuthStore();
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await authApi.login(formData);
      login(res.data.user, res.data.accessToken);
      router.push("/projects");
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Đăng nhập thất bại";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Suspense fallback={null}>
        <OAuthErrorFromQuery onError={setError} />
      </Suspense>

      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary">Frame.io Clone</h1>
        <p className="mt-2 text-text-secondary">Đăng nhập để tiếp tục</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6 bg-bg-secondary p-8 rounded-lg border border-border">
        {error && (
          <div className="bg-accent-red/10 border border-accent-red text-accent-red px-4 py-3 rounded">
            {error}
          </div>
        )}

        <Input
          id="email"
          type="email"
          label="Email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="your@email.com"
        />

        <div>
          <div className="flex items-center justify-between mb-2">
            <label htmlFor="password" className="block text-sm font-medium">
              Mật khẩu
            </label>
            <Link href="/forgot-password" className="text-xs text-primary hover:underline">
              Quên mật khẩu?
            </Link>
          </div>
          <Input
            id="password"
            type="password"
            required
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            placeholder="••••••••"
          />
        </div>

        <Button type="submit" size="lg" className="w-full" loading={loading}>
          {loading ? "Đang đăng nhập..." : "Đăng nhập"}
        </Button>

        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-text-secondary">hoặc</span>
          <div className="flex-1 h-px bg-border" />
        </div>

        <GoogleButton label="Đăng nhập với Google" />

        <p className="text-center text-sm text-text-secondary">
          Chưa có tài khoản?{" "}
          <Link href="/register" className="text-primary hover:underline">
            Đăng ký
          </Link>
        </p>
      </form>
    </>
  );
}