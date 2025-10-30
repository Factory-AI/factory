import { handleChatRequest } from "./chat";

await Bun.build({
  entrypoints: ["src/main.tsx"],
  outdir: "public",
  naming: "app",
  target: "browser",
  minify: true,
  sourcemap: "none"
});

const port = Number(Bun.env.PORT ?? 4000);
const hostname = Bun.env.HOST ?? "localhost";

const server = Bun.serve({
  port,
  hostname,
  idleTimeout: 255,
  async fetch(req) {
    const url = new URL(req.url);

    if (req.method === "GET" && url.pathname === "/api/markdown") {
      const file = Bun.file("public/data/mcp-boilerplate.md");
      if (!(await file.exists())) {
        return new Response("markdown not found", { status: 404 });
      }
      return new Response(file, {
        headers: { "Content-Type": "text/markdown; charset=utf-8" }
      });
    }

    if (req.method === "POST" && url.pathname === "/api/chat") {
      return handleChatRequest(req);
    }

    // serve static assets from ./public (url paths are absolute)
    const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
    const file = Bun.file(`public${pathname}`);
    if (await file.exists()) {
      const headers = { "Content-Type": contentTypeFor(pathname) } as Record<string, string>;
      return new Response(file, { headers });
    }

    return new Response("Not found", { status: 404 });
  }
});

console.log(`droid chat demo ready at http://${hostname}:${server.port}`);

function contentTypeFor(pathname: string): string {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  if (pathname.endsWith(".css")) return "text/css; charset=utf-8";
  if (pathname.endsWith(".svg")) return "image/svg+xml";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".mp3")) return "audio/mpeg";
  if (pathname.endsWith(".png")) return "image/png";
  if (pathname.endsWith(".jpg") || pathname.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}
