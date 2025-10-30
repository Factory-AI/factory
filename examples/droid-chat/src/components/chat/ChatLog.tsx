import React from "react";
import Spinner from "../Spinner";
import { renderMarkdown } from "../../lib/markdown";

type Turn = { role: "user" | "assistant" | "meta"; content: string };

type Props = {
  logRef: React.RefObject<HTMLDivElement>;
  messages: Turn[];
  loading: boolean;
  spinnerText: string;
};

export default function ChatLog({ logRef, messages, loading, spinnerText }: Props) {
  return (
    <div ref={logRef} className="chat-log" aria-live="polite">
      {messages.map((turn, index) => {
        const role = turn.role === "meta" ? "debug" : turn.role;
        if (turn.role === "assistant") {
          return (
            <div
              key={index}
              className="chat-msg"
              data-role={role}
              dangerouslySetInnerHTML={{ __html: renderMarkdown(turn.content) }}
            />
          );
        }
        return (
          <div key={index} className="chat-msg" data-role={role}>
            {turn.content}
          </div>
        );
      })}
      {loading && <Spinner status={spinnerText} />}
    </div>
  );
}

