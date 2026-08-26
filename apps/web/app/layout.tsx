import type { Metadata } from "next";
import "./globals.css";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { ToastProvider } from "@/components/ui/Toast";

export const metadata: Metadata = {
  title: "Frame.io Clone - Video Review & Collaboration",
  description: "A self-hosted video review and collaboration platform",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="vi" suppressHydrationWarning>
      <body className="min-h-screen bg-bg-primary text-text-primary antialiased">
        <TooltipProvider>
          <ToastProvider>{children}</ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}