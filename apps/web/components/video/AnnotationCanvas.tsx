"use client";

import { useRef, useEffect, useState } from "react";
import { Pencil, Highlighter, Type, Square, Eraser } from "lucide-react";

export interface SavedAnnotation {
  id?: string;
  type: string;
  color: string;
  // Points/x/y/width/height stored as 0-1 fractions of canvas size so they
  // redraw correctly regardless of viewport/canvas size at save vs. load time.
  points?: Array<{ x: number; y: number }>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  text?: string;
}

interface AnnotationCanvasProps {
  isActive: boolean;
  savedAnnotations?: SavedAnnotation[];
  onAnnotationComplete: (data: SavedAnnotation) => void;
  onDeleteAnnotation?: (id: string) => void;
}

type Tool = "draw" | "highlight" | "text" | "rectangle" | null;
type Point = { x: number; y: number };

// Mirrors the `accent-red` design token (tailwind.config.ts) — Canvas 2D
// drawing needs a literal color string, a Tailwind class doesn't apply here.
const DEFAULT_ANNOTATION_COLOR = "#ef4444";

export function AnnotationCanvas({
  isActive,
  savedAnnotations = [],
  onAnnotationComplete,
  onDeleteAnnotation,
}: AnnotationCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentTool, setCurrentTool] = useState<Tool>("draw");
  const [color, setColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [points, setPoints] = useState<Point[]>([]);
  const [rectStart, setRectStart] = useState<Point | null>(null);
  const [textInputPos, setTextInputPos] = useState<Point | null>(null);
  const [textValue, setTextValue] = useState("");
  // Strokes drawn in the current session that haven't been attached to a
  // comment yet (no `id`, not in `savedAnnotations`). Tracked separately so
  // the eraser can undo them locally without an API call, and so they don't
  // vanish when redrawAll() repaints (e.g. while dragging a rectangle preview).
  const [pendingStrokes, setPendingStrokes] = useState<SavedAnnotation[]>([]);

  const drawAnnotationShape = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, annotation: SavedAnnotation) => {
    ctx.strokeStyle = annotation.color;
    ctx.fillStyle = annotation.color;

    if (annotation.type === "rectangle" && annotation.x != null && annotation.y != null) {
      ctx.lineWidth = 3;
      ctx.globalAlpha = 1;
      ctx.strokeRect(
        annotation.x * canvas.width,
        annotation.y * canvas.height,
        (annotation.width || 0) * canvas.width,
        (annotation.height || 0) * canvas.height
      );
      return;
    }

    if (annotation.type === "text" && annotation.text && annotation.x != null && annotation.y != null) {
      ctx.font = "16px sans-serif";
      ctx.globalAlpha = 1;
      ctx.fillText(annotation.text, annotation.x * canvas.width, annotation.y * canvas.height);
      return;
    }

    if (!annotation.points || annotation.points.length < 2) return;
    const pixelPoints = annotation.points.map((p) => ({ x: p.x * canvas.width, y: p.y * canvas.height }));
    ctx.lineWidth = annotation.type === "highlight" ? 20 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.globalAlpha = annotation.type === "highlight" ? 0.3 : 1;
    ctx.beginPath();
    pixelPoints.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const redrawAll = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const annotation of [...savedAnnotations, ...pendingStrokes]) {
      drawAnnotationShape(ctx, canvas, annotation);
    }
  };

  const drawRectPreview = (start: Point, current: Point) => {
    redrawAll();
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx || !canvas) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = 1;
    ctx.strokeRect(
      Math.min(start.x, current.x),
      Math.min(start.y, current.y),
      Math.abs(current.x - start.x),
      Math.abs(current.y - start.y)
    );
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;

    redrawAll();
  }, []);

  useEffect(() => {
    redrawAll();
  }, [savedAnnotations, pendingStrokes]);

  // Entering/leaving annotation mode starts a fresh undo session — strokes
  // from a prior session are by then either persisted (now in savedAnnotations)
  // or abandoned (existing behavior: unsaved strokes are lost if you toggle
  // draw mode off without submitting a comment).
  useEffect(() => {
    setPendingStrokes([]);
  }, [isActive]);

  const getCoords = (e: React.MouseEvent<HTMLCanvasElement>): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isActive || !currentTool) return;
    const coords = getCoords(e);

    if (currentTool === "text") {
      setTextInputPos(coords);
      return;
    }

    setIsDrawing(true);
    if (currentTool === "rectangle") {
      setRectStart(coords);
      return;
    }
    setPoints([coords]);
  };

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !isActive || !currentTool) return;
    const coords = getCoords(e);

    if (currentTool === "rectangle") {
      if (rectStart) drawRectPreview(rectStart, coords);
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas!.getContext("2d");
    if (!ctx) return;

    setPoints((prev) => [...prev, coords]);

    ctx.strokeStyle = color;
    ctx.lineWidth = currentTool === "highlight" ? 20 : 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (currentTool === "highlight") ctx.globalAlpha = 0.3;

    ctx.beginPath();
    const lastPoint = points[points.length - 1];
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  const stopDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing) return;
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (currentTool === "rectangle" && rectStart) {
      const current = getCoords(e);
      const x = Math.min(rectStart.x, current.x) / canvas.width;
      const y = Math.min(rectStart.y, current.y) / canvas.height;
      const width = Math.abs(current.x - rectStart.x) / canvas.width;
      const height = Math.abs(current.y - rectStart.y) / canvas.height;
      setRectStart(null);
      if (width > 0.01 && height > 0.01) {
        const stroke: SavedAnnotation = { type: "rectangle", color, x, y, width, height };
        setPendingStrokes((prev) => [...prev, stroke]);
        onAnnotationComplete(stroke);
      } else {
        redrawAll();
      }
      return;
    }

    if (points.length > 1 && currentTool) {
      const stroke: SavedAnnotation = {
        type: currentTool,
        color,
        points: points.map((p) => ({ x: p.x / canvas.width, y: p.y / canvas.height })),
      };
      setPendingStrokes((prev) => [...prev, stroke]);
      onAnnotationComplete(stroke);
    }
    setPoints([]);
  };

  const commitText = () => {
    const canvas = canvasRef.current;
    if (textValue.trim() && textInputPos && canvas) {
      const stroke: SavedAnnotation = {
        type: "text",
        color,
        x: textInputPos.x / canvas.width,
        y: textInputPos.y / canvas.height,
        text: textValue.trim(),
      };
      setPendingStrokes((prev) => [...prev, stroke]);
      onAnnotationComplete(stroke);
    }
    setTextInputPos(null);
    setTextValue("");
  };

  // Undo the most recent stroke of the current session first (local-only,
  // no API call) before falling back to deleting an already-saved one.
  const eraseLast = () => {
    if (pendingStrokes.length > 0) {
      setPendingStrokes((prev) => prev.slice(0, -1));
      return;
    }
    const last = savedAnnotations[savedAnnotations.length - 1];
    if (last?.id) onDeleteAnnotation?.(last.id);
  };

  const tools = [
    { id: "draw" as Tool, icon: Pencil, label: "Vẽ" },
    { id: "highlight" as Tool, icon: Highlighter, label: "Đánh dấu" },
    { id: "text" as Tool, icon: Type, label: "Chèn chữ" },
    { id: "rectangle" as Tool, icon: Square, label: "Hình chữ nhật" },
  ];

  return (
    <div className={`absolute inset-0 z-20 ${isActive ? "" : "pointer-events-none"}`}>
      {/* Toolbar */}
      {isActive && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/80 rounded-lg p-2 z-30">
          {tools.map((tool) => (
            <button
              key={tool.id}
              onClick={() => setCurrentTool(tool.id)}
              aria-pressed={currentTool === tool.id}
              aria-label={tool.label}
              className={`p-2 rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue ${
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
            aria-label="Chọn màu chú thích"
            className="w-8 h-8 rounded cursor-pointer"
          />
          <button
            onClick={eraseLast}
            disabled={savedAnnotations.length === 0 && pendingStrokes.length === 0}
            aria-label="Xóa nét gần nhất"
            className="p-2 text-white/70 hover:bg-white/10 rounded disabled:opacity-30 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent-blue"
            title="Xóa nét gần nhất"
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

      {textInputPos && (
        <input
          autoFocus
          value={textValue}
          onChange={(e) => setTextValue(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commitText();
            } else if (e.key === "Escape") {
              setTextInputPos(null);
              setTextValue("");
            }
          }}
          aria-label="Nhập nội dung chú thích"
          className="absolute z-[25] rounded border bg-black/70 px-1 py-0.5 text-sm"
          style={{
            left: textInputPos.x,
            top: textInputPos.y,
            color,
            borderColor: color,
          }}
        />
      )}
    </div>
  );
}
