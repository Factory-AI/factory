export function parseAndFlush(
  buffer: string,
  send: (event: string, data: any) => void,
  repoRoot: string
): string {
  let working = buffer;
  while (true) {
    const trimmed = working.trimStart();
    const offset = working.length - trimmed.length;
    if (offset > 0) {
      working = trimmed;
    }
    if (!working) return "";
    if (working[0] !== "{") {
      const nextBrace = working.indexOf("{");
      if (nextBrace === -1) return working;
      working = working.slice(nextBrace);
    }
    let depth = 0;
    let inString = false;
    let escape = false;
    let endIndex = -1;
    for (let i = 0; i < working.length; i++) {
      const ch = working[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === "\\") {
        escape = true;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "{") depth++;
      if (ch === "}") {
        depth--;
        if (depth === 0) {
          endIndex = i;
          break;
        }
      }
    }
    if (endIndex === -1) return working;

    const chunk = working.slice(0, endIndex + 1);
    working = working.slice(endIndex + 1);
    try {
      const payload = JSON.parse(chunk);
      const sanitized = sanitizePayload(payload, repoRoot);
      if (sanitized.type === "message" && sanitized.role === "user") {
        continue;
      }
      send(sanitized.type ?? "message", sanitized);
    } catch (err) {
      console.error("Failed to parse chunk", err, chunk);
    }
  }
}

function sanitizePayload(payload: any, repoRoot: string) {
  const copy = { ...payload };
  const sanitizeText = (value: any) => (typeof value === "string" ? sanitizePath(value, repoRoot) : value);

  if (typeof copy.text === "string") copy.text = sanitizePath(copy.text, repoRoot);
  if (typeof copy.value === "string") copy.value = sanitizePath(copy.value, repoRoot);
  if (copy.error && typeof copy.error.message === "string") {
    copy.error = { ...copy.error, message: sanitizePath(copy.error.message, repoRoot) };
  }
  if (copy.parameters && typeof copy.parameters === "object") {
    copy.parameters = Object.fromEntries(
      Object.entries(copy.parameters).map(([key, value]) => [key, sanitizeText(value)])
    );
  }
  return copy;
}

function sanitizePath(text: string, repoRoot: string): string {
  if (!text || !repoRoot) return text;
  const normalizedRoot = repoRoot.replace(/\\/g, "/");
  return text
    .split(repoRoot)
    .join("")
    .split(normalizedRoot)
    .join("")
    .replace(/^\/+/, "/");
}

