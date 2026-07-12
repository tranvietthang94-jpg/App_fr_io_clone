"use client";

import { useRef, useEffect, useState } from "react";
import { Pencil, Highlighter, Type, Square, Eraser } from "lucide-react";

interface AnnotationCanvasProps {
  isActive: boolean;
  onAnnotationComplete: (data: {
    type: string;
    points: Array<{ x: number; y: number }>;
    color: string;
  }) => void;
}

type Tool = "draw" | "highlight" | "text" | "rectangle" | null;

export function AnnotationCanvas({ isActive, onAnnotationComplete }: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>("draw");
  const [color, setColor] = useState("#ff0000");
  const [points, setPoints] = useState<Array<{ x: number; y: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
  }, []);

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive || !currentTool) return;

    setIsDrawing(true);
    const rect = canvasRef.current!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    setPoints([{ x, y }]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isActive || !currentTool) return;

    const canvas = canvasRef.current;
    const ctx = canvas!.getContext("2d");
    if (!ctx) return;

    const rect = canvas!.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPoints((prev) => [...prev, { x, y }]);

    ctx.strokeStyle = color;
    ctx.lineWidth = currentTool === "highlight" ? 20 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    if (currentTool === "highlight") {
      ctx.globalAlpha = 0.3;
    }

    ctx.beginPath();
    const lastPoint = points[points.length - 1];
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    ctx.globalAlpha = 1;
  };

  const stopDrawing = () => {
    if (!isDrawing) return;

    setIsDrawing(false);

    if (points.length > 1 && currentTool) {
      onAnnotationComplete({
        type: currentTool,
        points,
        color,
      });
    }

    setPoints([]);
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  const tools = [
    { id: "draw" as Tool, icon: Pencil, label: "Vẽ" },
    { id: "highlight" as Tool, icon: Highlighter, label: "Highlight" },
    { id: "text" as Tool, icon: Type, label: "Text" },
    { id: "rectangle" as Tool, icon: Square, label: "Hình chữ nhật" },
  ];

  return (
    <div className="absolute inset-0 z-20">
      {/* Toolbar */}
      {isActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 rounded-lg p-2 z-30">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setCurrentTool(tool.id)}
              className={`p-2 rounded ${
                currentTool === tool.id
                  ? "bg-primary text-white"
                  : "text-white/70 hover:bg-white/10"
              }`}
              title={tool.label}
            >
              <tool.icon className="w-5 h-5" />
            </button>
          ))}
          <div className="w-px h-6 bg-white/20" />
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="w-8 h-8 rounded cursor-pointer"
          />
          <button
            onClick={clearCanvas}
            className="p-2 text-white/70 hover:bg-white/10 rounded"
            title="Xóa tất cả"
          >
            <Eraser className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${isActive ? "cursor-crosshair" : "pointer-events-none"}`}
        onMouseDown={startDrawing}
        onMouseMove={draw}
        onMouseUp={stopDrawing}
        onMouseLeave={stopDrawing}
      />
    </div>
  );
}