import type { Metadata } from "next";
import "./globals.css";

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
    <html lang="vi">
      <body className="min-h-screen bg-[#0a0a0a] text-[#ededed] antialiased">
        {children}
      </body>
    </html>
  );
}