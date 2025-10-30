import { useEffect } from "react";
import type { RefObject } from "react";

type ResizeCallbacks = {
  onResizeStart?: () => void;
  onResizeMove?: () => void;
  onResizeEnd?: () => void;
};

export function useResize(ref: RefObject<HTMLElement>, callbacks: ResizeCallbacks = {}) {
  const { onResizeStart, onResizeMove, onResizeEnd } = callbacks;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const handle = el.querySelector<HTMLElement>(".chat-resize-corner");
    if (!handle) return;

    let resizing = false;
    let startX = 0;
    let startY = 0;
    let startWidth = 0;
    let startHeight = 0;

    const handleMouseDown = (event: MouseEvent) => {
      resizing = true;
      const rect = el.getBoundingClientRect();
      el.style.transform = "none";
      el.style.left = `${rect.left}px`;
      el.style.top = `${rect.top}px`;
      startX = event.clientX;
      startY = event.clientY;
      startWidth = el.offsetWidth;
      startHeight = el.offsetHeight;
      event.preventDefault();
      onResizeStart?.();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!resizing) return;
      const width = Math.max(320, Math.min(window.innerWidth * 0.9, startWidth + (event.clientX - startX)));
      const height = Math.max(200, Math.min(window.innerHeight * 0.9, startHeight + (event.clientY - startY)));
      el.style.width = `${width}px`;
      el.style.height = `${height}px`;
      onResizeMove?.();
    };

    const handleMouseUp = () => {
      if (!resizing) return;
      resizing = false;
      onResizeEnd?.();
    };

    handle.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      handle.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [ref, onResizeEnd, onResizeMove, onResizeStart]);
}
