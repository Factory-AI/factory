import { useEffect } from "react";
import type { RefObject } from "react";

type DragCallbacks = {
  onDragStart?: () => void;
  onDragMoveStart?: () => void;
  onDragMoveStop?: () => void;
  onDragEnd?: () => void;
};

export function useDrag(ref: RefObject<HTMLElement>, callbacks: DragCallbacks = {}) {
  const { onDragStart, onDragMoveStart, onDragMoveStop, onDragEnd } = callbacks;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const title = el.querySelector<HTMLElement>(".chat-titlebar");
    if (!title) return;

    let dragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let startX = 0;
    let startY = 0;
    let moved = false; // surpassed threshold at least once in this drag
    let moving = false; // currently moving (vs. held down without motion)
    let idleTimer: number | undefined;
    let lastLeft = 0;
    let lastTop = 0;

    const handleMouseDown = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if ((event.target as HTMLElement)?.closest(".chat-close-btn")) {
        return;
      }
      dragging = true;
      moved = false;
      moving = false;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      
      const rect = el.getBoundingClientRect();
      offsetX = event.clientX - rect.left;
      offsetY = event.clientY - rect.top;
      startX = event.clientX;
      startY = event.clientY;
      lastLeft = rect.left;
      lastTop = rect.top;
      
      // set explicit left/top in pixels and clear transform
      const leftPos = rect.left;
      const topPos = rect.top;
      el.style.left = `${leftPos}px`;
      el.style.top = `${topPos}px`;
      el.style.transform = "none";
      
      onDragStart?.();
      event.preventDefault();
    };
    
    const handleContextMenu = (event: MouseEvent) => {
      event.preventDefault();
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!dragging) return;
      const dx = event.clientX - offsetX;
      const dy = event.clientY - offsetY;
      const maxX = window.innerWidth - el.offsetWidth;
      const maxY = window.innerHeight - el.offsetHeight;
      const left = Math.max(0, Math.min(dx, maxX));
      const top = Math.max(0, Math.min(dy, maxY));

      // detect surpassing movement threshold
      if (!moved && (Math.abs(event.clientX - startX) > 3 || Math.abs(event.clientY - startY) > 3)) {
        moved = true;
      }

      const changed = left !== lastLeft || top !== lastTop;

      // if we have actual movement, mark moving state and (re)start idle timer
      if (moved && changed) {
        if (!moving) {
          moving = true;
          onDragMoveStart?.();
        }
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = window.setTimeout(() => {
          if (dragging && moving) {
            moving = false;
            onDragMoveStop?.();
          }
        }, 150);
      }

      el.style.left = `${left}px`;
      el.style.top = `${top}px`;
      if (changed) {
        lastLeft = left;
        lastTop = top;
      }
    };

    const handleMouseUp = (event: MouseEvent) => {
      if (event.button !== 0) return;
      if (!dragging) return;
      dragging = false;
      if (idleTimer) {
        clearTimeout(idleTimer);
        idleTimer = undefined;
      }
      if (moving) {
        moving = false;
        onDragMoveStop?.();
      }
      onDragEnd?.();
    };

    title.addEventListener("mousedown", handleMouseDown);
    title.addEventListener("contextmenu", handleContextMenu);
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);

    return () => {
      title.removeEventListener("mousedown", handleMouseDown);
      title.removeEventListener("contextmenu", handleContextMenu);
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [ref, onDragStart, onDragMoveStart, onDragMoveStop, onDragEnd]);
}
