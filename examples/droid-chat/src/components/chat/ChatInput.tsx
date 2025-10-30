import React from "react";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement>;
  onSubmit: (event: React.FormEvent) => void;
  autoGrow: () => void;
};

export default function ChatInput({ textareaRef, onSubmit, autoGrow }: Props) {
  return (
    <form className="chat-input" onSubmit={onSubmit}>
      <textarea
        ref={textareaRef}
        placeholder="Ask about this repo..."
        onInput={autoGrow}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            onSubmit(event as unknown as React.FormEvent);
          }
        }}
        rows={1}
      />
    </form>
  );
}

