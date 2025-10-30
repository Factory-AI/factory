import { readFileSync } from "node:fs";

type HistoryTurn = { role: "user" | "assistant"; content: string };

export function buildPrompt(message: string, history: HistoryTurn[]): string {
  const historyStr = formatHistory(history);
  return [
    `[system] ${SYSTEM_PROMPT}`,
    historyStr ? `\n\n[history]\n${historyStr}` : "",
    historyStr ? `\n[user] ${message}\n[/history]` : `\n\n[user] ${message}`,
    "\n\n[remind] Be concise and direct in your response. Do not reveal full filesystem paths or any user/system identity details.",
    "\n[assistant]"
  ].join("");
}

function formatHistory(history: HistoryTurn[]): string {
  const parts: string[] = [];
  for (const turn of history) {
    const role = turn.role === "assistant" ? "[assistant]" : "[user]";
    const text = turn.content.trim();
    if (text) parts.push(`${role} ${text}`);
  }
  const joined = parts.join("\n");
  return joined.length > 60_000 ? joined.slice(-60_000) : joined;
}

export const SYSTEM_PROMPT = readFileSync(new URL("../prompts/system-prompt.md", import.meta.url), "utf8");
