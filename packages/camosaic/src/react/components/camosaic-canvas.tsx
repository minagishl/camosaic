import { useEffect, useRef } from "react";
import type { CamosaicChild } from "../../core/synchronization/child";

export interface CamosaicCanvasProps extends React.CanvasHTMLAttributes<HTMLCanvasElement> {
  child: CamosaicChild;
}

export function CamosaicCanvas({ child, ...props }: CamosaicCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let frame = 0;
    let width = 0, height = 0, dpr = 1;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (width && height) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
        child.size = { w: width, h: height };
        if (child.connected) child.sendSize();
      }
    };
    const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);
    if (!observer) window.addEventListener("resize", resize);
    resize();
    const context = canvas.getContext("2d");
    const draw = () => {
      if (context && width && height) child.render(context, width, height, dpr);
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", resize);
    };
  }, [child]);

  return <canvas {...props} ref={ref} />;
}
