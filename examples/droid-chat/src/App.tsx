import React, { useEffect, useState } from "react";
import MarkdownBackdrop from "./components/MarkdownBackdrop";
import ChatWindow from "./components/chat/ChatWindow";

export default function App() {
  const [markdown, setMarkdown] = useState("");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/markdown")
      .then((res) => res.text())
      .then((text) => {
        if (!cancelled) setMarkdown(text);
      })
      .catch((err) => console.error("failed to load markdown", err));

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="app-shell">
      <MarkdownBackdrop markdown={markdown} />
      <ChatWindow />
    </div>
  );
}
