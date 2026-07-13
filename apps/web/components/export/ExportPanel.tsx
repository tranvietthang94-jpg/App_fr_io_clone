"use client";

import { FileText, FileCode, Download, Film, MessageSquare } from "lucide-react";
import { formatTimecode, formatDate } from "@/lib/utils";
import type { Video, Comment } from "@fr-clone/shared";

interface ExportPanelProps {
  video: Video;
  comments: Comment[];
  onExportXml: () => Promise<void>;
  onExportPdf: () => Promise<void>;
}

export function ExportPanel({
  video,
  comments,
  onExportXml,
  onExportPdf,
}: ExportPanelProps) {
  return (
    <div className="p-6">
      <h3 className="font-semibold flex items-center gap-2 mb-6">
        <Download className="w-5 h-5" />
        <span>Xuất báo cáo</span>
      </h3>

      {/* Video info */}
      <div className="bg-bg-tertiary/50 rounded-lg p-4 mb-6">
        <h4 className="text-sm font-medium mb-3 text-text-secondary">Thông tin video</h4>
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Tên:</span>
            <span className="font-medium truncate ml-2 max-w-[180px]">{video.title}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Thời lượng:</span>
            <span>{formatTimecode(video.duration, video.fps)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Kích thước:</span>
            <span>{video.width}x{video.height}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-text-secondary">Số bình luận:</span>
            <span>{comments.length}</span>
          </div>
        </div>
      </div>

      {/* Export options */}
      <div className="space-y-4">
        {/* XML Export */}
        <div className="bg-bg-tertiary/50 rounded-lg p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <FileCode className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <h4 className="font-medium">Xuất XML</h4>
              <p className="text-sm text-text-secondary">
                Dữ liệu bình luận dạng XML, có thể import vào các hệ thống khác
              </p>
            </div>
          </div>
          <button
            onClick={onExportXml}
            className="w-full py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-500 rounded-md transition-colors text-sm font-medium"
          >
            Tải xuống XML
          </button>
        </div>

        {/* PDF Export */}
        <div className="bg-bg-tertiary/50 rounded-lg p-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center">
              <FileText className="w-5 h-5 text-red-500" />
            </div>
            <div>
              <h4 className="font-medium">Xuất PDF</h4>
              <p className="text-sm text-text-secondary">
                Báo cáo PDF kèm theo screenshot và bình luận
              </p>
            </div>
          </div>
          <button
            onClick={onExportPdf}
            className="w-full py-2 bg-red-500/10 hover:bg-red-500/20 text-red-500 rounded-md transition-colors text-sm font-medium"
          >
            Tải xuống PDF
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="mt-6">
        <h4 className="text-sm font-medium mb-3 text-text-secondary">Xem trước nội dung</h4>
        <div className="bg-bg-tertiary/50 rounded-lg p-4 text-xs font-mono overflow-auto max-h-[300px]">
          <pre className="text-text-secondary">
{`<?xml version="1.0" encoding="UTF-8"?>
<review>
  <video>
    <title>${video.title}</title>
    <duration>${video.duration.toFixed(2)}</duration>
  </video>
  <comments count="${comments.length}">
${comments.slice(0, 3).map(c => `    <comment timestamp="${c.timestamp.toFixed(2)}">
      <content>${c.content}</content>
    </comment>`).join('\n')}
${comments.length > 3 ? `    <!-- ... và ${comments.length - 3} bình luận khác -->` : ""}
  </comments>
</review>`}
          </pre>
        </div>
      </div>
    </div>
  );
}