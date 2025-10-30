import React, { useEffect, useState } from "react";

const frames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

export default function Spinner({ status }: { status: string }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((prev) => (prev + 1) % frames.length), 80);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="chat-msg" data-role="loading">
      <span className="spinner-icon">{frames[index]}</span>
      <span className="spinner-status"> {status}</span>
    </div>
  );
}
