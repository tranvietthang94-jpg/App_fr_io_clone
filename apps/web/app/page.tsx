"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/stores/authStore";

export default function Home() {
  const router = useRouter();
  const { isAuthenticated, hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!hasHydrated) return;
    if (isAuthenticated) {
      router.push("/projects");
    } else {
      router.push("/login");
    }
  }, [hasHydrated, isAuthenticated, router]);

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-primary mb-4">Frame.io Clone</h1>
        <p className="text-text-secondary">Đang chuyển hướng...</p>
      </div>
    </div>
  );
}