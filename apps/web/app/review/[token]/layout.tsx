import type { Metadata } from "next";
import type { ReactNode } from "react";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_APP_URL || "";

/**
 * Per-link metadata for the guest review page. Messengers (Messenger/Zalo/
 * WhatsApp) render link previews from raw HTML meta tags with no JS, so the
 * clip's name and preview frame must be generated server-side per share
 * token — the page itself is a client component and can't do this.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const fallback: Metadata = {
    title: "R.Frame — Xem và bình luận video",
    description: "Xem và bình luận video trên R.Frame",
  };
  if (!API_BASE || !token) return fallback;

  try {
    const res = await fetch(`${API_BASE}/api/public/review/${token}`, {
      cache: "no-store",
    });
    if (!res.ok) return fallback;
    const data = await res.json();
    const clipTitle: string | undefined = data?.video?.title;
    if (!clipTitle) return fallback;

    const description = `Xem và bình luận "${clipTitle}" trên R.Frame`;
    return {
      title: clipTitle,
      description,
      openGraph: {
        title: clipTitle,
        description,
        images: [`${API_BASE}/api/public/review/${token}/thumbnail`],
      },
      twitter: {
        card: "summary_large_image",
        title: clipTitle,
        description,
        images: [`${API_BASE}/api/public/review/${token}/thumbnail`],
      },
    };
  } catch {
    return fallback;
  }
}

export default function ReviewLayout({ children }: { children: ReactNode }) {
  return children;
}
