import { useCallback, useEffect, useRef } from "react";
import type React from "react";

/** How long to hold before it counts as a long press. */
export const LONG_PRESS_MS = 500;
/** Moving the finger further than this (scrolling) cancels the press. */
const MOVE_TOLERANCE_PX = 10;

/**
 * Pointer handlers for a long press (touch, pen or mouse). Scrolling cancels it, and the browser's own
 * long-press actions (context menu, text selection, link preview) are suppressed on the element.
 */
export function useLongPress(onLongPress: () => void, ms = LONG_PRESS_MS) {
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const start = useRef<{ x: number; y: number } | null>(null);
  const callback = useRef(onLongPress);
  callback.current = onLongPress;

  const cancel = useCallback(() => {
    clearTimeout(timer.current);
    start.current = null;
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    onPointerDown: (event: React.PointerEvent) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      start.current = { x: event.clientX, y: event.clientY };
      clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        start.current = null;
        try {
          navigator.vibrate?.(15);
        } catch {
          // Vibration is optional.
        }
        callback.current();
      }, ms);
    },
    onPointerMove: (event: React.PointerEvent) => {
      if (!start.current) return;
      if (Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y) > MOVE_TOLERANCE_PX) cancel();
    },
    onPointerUp: cancel,
    onPointerLeave: cancel,
    onPointerCancel: cancel,
    onContextMenu: (event: React.MouseEvent) => event.preventDefault(),
    style: { WebkitTouchCallout: "none" } as React.CSSProperties,
  };
}
