"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authApi } from "@/lib/api";
import { useAuthStore } from "@/lib/stores/authStore";

export default function GoogleCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const accessToken = params.get("accessToken");
    if (!accessToken) {
      router.push("/login?error=google_failed");
      return;
    }

    useAuthStore.getState().setAccessToken(accessToken);
    authApi
      .getMe()
      .then((res) => {
        useAuthStore.getState().login(res.data, accessToken);
        router.push("/projects");
      })
      .catch(() => {
        setError(true);
        router.push("/login?error=google_failed");
      });
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="text-center">
        <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-text-secondary">
          {error ? "Đăng nhập thất bại, đang chuyển hướng..." : "Đang đăng nhập..."}
        </p>
      </div>
    </div>
  );
}
