import { getLocalRepoInfo } from "./repo";
import { buildPrompt } from "./prompt";
import { parseAndFlush } from "./stream";

type HistoryTurn = { role: "user" | "assistant"; content: string };

export async function handleChatRequest(req: Request): Promise<Response> {
  const payload = (await req.json().catch(() => null)) as any;
  if (!payload || typeof payload.message !== "string" || !payload.message.trim()) {
    return new Response(JSON.stringify({ error: "Missing message" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
    });
  }

  const historyRaw = Array.isArray(payload.history) ? (payload.history as HistoryTurn[]) : [];
  const history: HistoryTurn[] = historyRaw
    .map((turn): HistoryTurn => ({
      role: turn?.role === "assistant" ? "assistant" : "user",
      content: String(turn?.content ?? "")
    }))
    .filter((turn) => turn.content.length > 0);

  let repoInfo;
  try {
    repoInfo = await getLocalRepoInfo();
  } catch (err) {
    console.error("Local repository not found", err);
    return new Response(JSON.stringify({ error: "local repository missing under ./repos" }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }

  const trimmedMsg = payload.message.length > 8000 ? payload.message.slice(0, 8000) : payload.message;
  const prompt = buildPrompt(trimmedMsg, history);
  const proc = runDroidExec(prompt, repoInfo.workdir);

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();
      let buffer = "";
      let timedOut = false;
      let closed = false;

      const send = (event: string, data: any) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
      };

      const timeout = setTimeout(() => {
        timedOut = true;
        try {
          proc.kill();
        } catch {
          // ignore
        }
      }, 240_000);

      (async () => {
        const reader = proc.stdout.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            buffer += decoder.decode(value, { stream: true });
            buffer = parseAndFlush(buffer, (event, data) => send(event, data), repoInfo.repoRoot);
          }
        } catch (err) {
          if (!closed) {
            closed = true;
            controller.error(err);
          }
        } finally {
          try {
            reader.releaseLock();
          } catch {}
        }
      })();

      (async () => {
        const reader = proc.stderr.getReader();
        try {
          while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            if (!value) continue;
            const chunk = decoder.decode(value, { stream: true });
            if (chunk.trim()) {
              send("stderr", { text: chunk.trim() });
            }
          }
        } catch (err) {
          console.error("stderr read failed", err);
        } finally {
          try {
            reader.releaseLock();
          } catch {}
        }
      })();

      proc.exited
        .then((code) => {
          clearTimeout(timeout);
          send("exit", { code, timedOut });
          if (!closed) {
            closed = true;
            controller.close();
          }
        })
        .catch((err) => {
          clearTimeout(timeout);
          if (!closed) {
            closed = true;
            controller.error(err);
          }
        });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive"
    }
  });
}

function runDroidExec(prompt: string, cwd: string) {
  const args = ["exec", "--output-format", "debug"];
  const model = Bun.env.DROID_MODEL_ID ?? Bun.env.REPO_CHAT_MODEL_ID ?? "glm-4.6";
  args.push("-m", model);
  const reasoning = Bun.env.DROID_REASONING ?? Bun.env.REPO_CHAT_REASONING;
  if (reasoning) {
    args.push("-r", reasoning);
  }
  args.push(prompt);
  return Bun.spawn(["droid", ...args], {
    cwd,
    stdio: ["ignore", "pipe", "pipe"]
  });
}
