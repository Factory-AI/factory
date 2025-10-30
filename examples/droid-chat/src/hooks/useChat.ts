import { useCallback, useRef, useState } from "react";

export type Turn = { role: "user" | "assistant" | "meta"; content: string };

type UseChatOptions = {
  onComplete?: (timedOut: boolean) => void;
};

export function useChat(opts: UseChatOptions = {}) {
  const { onComplete } = opts;
  const [messages, setMessages] = useState<Turn[]>([]);
  const [loading, setLoading] = useState(false);
  const [spinnerText, setSpinnerText] = useState("Thinking...");
  const chimedRef = useRef(false);
  const streamingIndexRef = useRef<number | null>(null);

  const appendTurn = useCallback((turn: Turn) => {
    setMessages((prev) => [...prev, turn]);
  }, []);

  const startAssistantStream = useCallback((text: string) => {
    setMessages((prev) => {
      streamingIndexRef.current = prev.length;
      return [...prev, { role: "assistant", content: text }];
    });
  }, []);

  const updateAssistantStream = useCallback((text: string) => {
    setMessages((prev) => {
      const idx = streamingIndexRef.current;
      if (idx === null || idx < 0 || idx >= prev.length) {
        return prev;
      }
      const copy = prev.slice();
      const current = copy[idx];
      if (current && current.role === "assistant") {
        copy[idx] = { role: "assistant", content: current.content + text };
      }
      return copy;
    });
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim()) return;
      if (loading) return;

      const userTurn: Turn = { role: "user", content };
      const history = [...messages, userTurn].filter((t): t is { role: "user" | "assistant"; content: string } => t.role === "user" || t.role === "assistant");
      appendTurn(userTurn);
      setLoading(true);
      setSpinnerText("Thinking...");
      chimedRef.current = false;
      streamingIndexRef.current = null;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream"
          },
          body: JSON.stringify({ message: content, history })
        });

        if (response.status === 409) {
          const text = await response.text().catch(() => "");
          appendTurn({ role: "assistant", content: text || "repository cache unavailable" });
          setLoading(false);
          return;
        }

        if (!response.ok || !response.body) {
          const text = await response.text().catch(() => "");
          appendTurn({ role: "assistant", content: text || `Error: HTTP ${response.status}` });
          setLoading(false);
          return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let eventName = "message";

        const flush = () => {
          if (!buffer) return;
          try {
            const payload = JSON.parse(buffer);
            handleEvent(payload, eventName);
          } catch (err) {
            appendTurn({ role: "assistant", content: buffer });
          } finally {
            buffer = "";
            eventName = "message";
          }
        };

        const toolStatus = (payload: any) => {
          const name = payload?.toolName || payload?.name || payload?.tool || "tool";
          switch (name) {
            case "LS":
              return "Listing files...";
            case "Read":
              return "Reading files...";
            case "Grep":
              return "Searching...";
            case "Glob":
              return "Finding files...";
            default:
              return "Running tool...";
          }
        };

        const handleEvent = (payload: any, evt: string) => {
          if (!payload) return;

          if (evt === "message" && payload.role === "assistant" && typeof payload.text === "string") {
            // treat assistant messages as streaming chunks
            if (streamingIndexRef.current == null) {
              startAssistantStream(payload.text);
            } else {
              updateAssistantStream(payload.text);
            }
            setLoading(false);
          } else if (evt === "tool_call") {
            setSpinnerText(toolStatus(payload));
            setLoading(true);
            streamingIndexRef.current = null;
          } else if (evt === "tool_result") {
            streamingIndexRef.current = null;
          } else if (evt === "stderr" || evt === "stderr_raw") {
            if (payload.text) {
              appendTurn({ role: "assistant", content: `stderr: ${payload.text}` });
            }
          } else if (evt === "exit") {
            setLoading(false);
            const isServerExit = payload && ("code" in payload || "timedOut" in payload);
            if (isServerExit && !chimedRef.current) {
              onComplete?.(Boolean(payload.timedOut));
              chimedRef.current = true;
            }
            // finalize stream for safety
            streamingIndexRef.current = null;
          } else if (evt === "debug_prompt" && payload.text) {
            appendTurn({ role: "meta", content: payload.text });
          }
        };

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          if (!value) continue;
          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split(/\n/);
          for (const line of lines) {
            if (line.startsWith("event:")) {
              eventName = line.slice(6).trim();
            } else if (line.startsWith("data:")) {
              const raw = line.slice(5);
              buffer += raw.startsWith(" ") ? raw.slice(1) : raw;
            } else if (!line.trim()) {
              flush();
            }
          }
        }

        flush();
        await reader.releaseLock();
        setLoading(false);
      } catch (err) {
        appendTurn({ role: "assistant", content: err instanceof Error ? err.message : String(err) });
        setLoading(false);
      }
    },
    [appendTurn, loading, messages, onComplete]
  );

  return { messages, loading, spinnerText, sendMessage };
}
