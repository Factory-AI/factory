import React, { useCallback, useEffect, useRef } from "react";
import { useDrag } from "../../hooks/useDrag";
import { useResize } from "../../hooks/useResize";
import ChatLog from "./ChatLog";
import ChatInput from "./ChatInput";
import { useChat } from "../../hooks/useChat";
import { chimeSound, closeSound, dragLoopSound, dragStopSound, openSound, resizeLoopSound, resizeStopSound } from "../../lib/sounds";

export default function ChatWindow() {
  const modalRef = useRef<HTMLDivElement>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [visible, setVisible] = React.useState(true);
  const [maximized, setMaximized] = React.useState(false);
  const { messages, loading, spinnerText, sendMessage } = useChat({
    onComplete: (timedOut) => {
      if (!timedOut) chimeSound.play();
    }
  });

  useEffect(() => {
    if (visible) {
      openSound.play();
    }
  }, [visible]);

  useEffect(() => () => dragLoopSound.stop(), []);

  useEffect(() => {
    if (!visible) return;
    const el = textareaRef.current;
    if (el) {
      el.focus();
    }
  }, [visible]);

  useDrag(modalRef, {
    onDragMoveStart: () => {
      if (!visible || maximized) return;
      dragLoopSound.play();
    },
    onDragMoveStop: () => {
      dragLoopSound.stop();
    },
    onDragEnd: () => {
      dragLoopSound.stop();
      dragStopSound.play();
    }
  });

  useResize(modalRef, {
    onResizeStart: () => {
      if (!visible || maximized) return;
      resizeLoopSound.play();
    },
    onResizeEnd: () => {
      resizeLoopSound.stop();
      resizeStopSound.play();
    }
  });

  useEffect(() => {
    if (!visible) {
      dragLoopSound.stop();
    }
  }, [visible]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    const id = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
    return () => cancelAnimationFrame(id);
  }, [messages, loading, maximized]);

  const autoGrow = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 24;
    const maxHeight = lineHeight * 5;
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
  }, []);

  // sendMessage now provided by useChat

  const handleSubmit = useCallback(
    (event: React.FormEvent) => {
      event.preventDefault();
      const value = textareaRef.current?.value.trim() ?? "";
      if (!value) return;
      if (textareaRef.current) {
        textareaRef.current.value = "";
        autoGrow();
      }
      sendMessage(value);
    },
    [autoGrow, sendMessage]
  );

  return (
    <>
      {!visible && (
        <button
          type="button"
          className="chat-open-btn"
          onClick={() => setVisible(true)}
        >
          open chat
        </button>
      )}
      <div
        ref={modalRef}
        className={`chat-modal ${visible ? "visible" : ""} ${maximized ? "maximized" : ""}`}
        style={maximized ? undefined : { left: "50%", top: "50%", transform: "translate(-50%, -50%)" }}
        role="dialog"
        aria-modal="true"
        aria-label="Chat with repository"
      >
        <div className="chat-titlebar">
          <span className="chat-title-text">chat with repo</span>
          <div className="chat-title-actions">
            <button
              type="button"
              className="chat-maximize-btn"
              onClick={() => setMaximized((prev) => !prev)}
              aria-label={maximized ? "restore" : "maximize"}
            >
              {maximized ? "[⇙]" : "[⇗]"}
            </button>
            <button
              type="button"
              className="chat-close-btn"
              onClick={() => {
                closeSound.play();
                setMaximized(false);
                setVisible(false);
              }}
            >
              [x]
            </button>
          </div>
        </div>
        <div className="chat-body">
          <ChatLog logRef={logRef} messages={messages} loading={loading} spinnerText={spinnerText} />
          <ChatInput textareaRef={textareaRef} onSubmit={handleSubmit} autoGrow={autoGrow} />
        </div>
        <div className="chat-resize-corner" aria-hidden="true">
          ◢
        </div>
      </div>
    </>
  );
}
