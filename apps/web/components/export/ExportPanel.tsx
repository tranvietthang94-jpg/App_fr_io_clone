"use client";

import { FileText, FileCode, Download } from "lucide-react";
import { formatTimecode } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { Video, Comment } from "@r-frame/shared";

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
            <div className="w-10 h-10 rounded-lg bg-accent-blue/10 flex items-center justify-center">
              <FileCode className="w-5 h-5 text-accent-blue" />
            </div>
            <div>
              <h4 className="font-medium">Xuất XML</h4>
              <p className="text-sm text-text-secondary">
                Dữ liệu bình luận dạng XML, có thể import vào các hệ thống khác
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20"
            onClick={onExportXml}
          >
            Tải xuống XML
          </Button>
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
          <Button
            variant="ghost"
            className="w-full bg-accent-red/10 text-accent-red hover:bg-accent-red/20"
            onClick={onExportPdf}
          >
            Tải xuống PDF
          </Button>
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