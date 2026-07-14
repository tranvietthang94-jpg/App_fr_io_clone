"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/lib/stores/authStore";
import { projectMembersApi } from "@/lib/api";

export default function InviteAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;
  const { isAuthenticated, hasHydrated } = useAuthStore();
  const [status, setStatus] = useState<"loading" | "error" | "done">("loading");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!hasHydrated) return;
    if (!isAuthenticated) {
      setStatus("error");
      return;
    }

    projectMembersApi
      .acceptInvite(token)
      .then((res) => {
        setStatus("done");
        router.push(`/projects/${res.data.projectId}`);
      })
      .catch((err) => {
        setError(err.response?.data?.message || "Không thể chấp nhận lời mời");
        setStatus("error");
      });
  }, [hasHydrated, isAuthenticated, token]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center bg-bg-secondary p-8 rounded-lg border border-border">
        <h1 className="text-2xl font-bold">Lời mời tham gia dự án</h1>

        {status === "loading" && <p className="text-text-secondary">Đang xử lý...</p>}

        {status === "error" && !isAuthenticated && (
          <div className="space-y-4">
            <p className="text-text-secondary">
              Bạn cần đăng nhập hoặc đăng ký để chấp nhận lời mời này. Sau khi đăng nhập, quay lại
              đường dẫn này để tiếp tục.
            </p>
            <div className="flex gap-3 justify-center">
              <Link
                href="/login"
                className="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md transition-colors"
              >
                Đăng nhập
              </Link>
              <Link
                href="/register"
                className="px-4 py-2 bg-bg-tertiary hover:bg-bg-hover rounded-md transition-colors"
              >
                Đăng ký
              </Link>
            </div>
          </div>
        )}

        {status === "error" && isAuthenticated && (
          <p className="text-accent-red">{error}</p>
        )}
      </div>
    </div>
  );
}
