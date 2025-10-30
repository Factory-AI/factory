# Droid Chat

This is a minimal, end‑to‑end demo of Droid Exec driving a chat agent over a local repository. Use it as a starting point for agents you can host on a VPS with access to file systems (and, with small changes, databases, PDFs, or websites) that users can interact with through a simple chat widget.

## Quick start

Requirements
- Bun
- Droid CLI installed (`droid` on your PATH)
- A repository folder inside `./repos/` (one repo is included)

Install Bun (if needed)
```
curl -fsSL https://bun.sh/install | bash
```

Install Droid CLI (if needed)
```
curl -fsSL https://app.factory.ai/cli | sh
```

Sign in to Factory (browser)
```
droid
```
Follow the browser login prompt once. After that, `droid exec` works from this app.

Run locally

```
git clone https://github.com/Factory-AI/factory.git
```

```
cd factory/examples/droid-chat
```

```
bun i
```

```
bun dev
```
Open http://localhost:4000 and ask questions about the repo.

You should see
- The repo’s markdown in the background
- A small chat window you can move/resize

## Why Droid Exec

Droid Exec is Factory’s headless, one‑shot execution mode that’s ideal for self‑hosted agents. It produces clean logs, can stream debug events, and uses autonomy levels so you control exactly what the agent may do on your server.

Docs
- https://docs.factory.ai/cli/droid-exec/overview

Common patterns
- Read‑only (default): plan changes, list files, summarize
- `--auto low`: safe project edits (docs, small refactors)
- `--auto medium`: dev tasks (install deps without sudo, build/test)
- `--auto high`: CI/CD workflows (commit/push allowed)

## Examples

Read‑only analysis:

```
droid exec "Summarize the repo layout"
```

Safe local edits:

```
droid exec --auto low "Fix typos in README.md"
```

Dev tasks:

```
droid exec --auto medium "Install deps and run tests"
```

CI/CD style:

```
droid exec --auto high "Fix bug, test, commit, push"
```

### Tips
- Prefer `--auto low` day‑to‑day; keep edits small and explicit
- Use `--cwd` to constrain scope in monorepos
- Use `--output-format debug` to stream tool events

### Configuration (optional)
- Model: `DROID_MODEL_ID` (for example `glm-4.6`, `gpt-5-codex`)
- Reasoning: `DROID_REASONING` (`off|low|medium|high`)
- Port/Host: `PORT`, `HOST`
- Bun auto-loads `.env` if present; see `.env.example`.

### Example `.env`

```
DROID_MODEL_ID=gpt-5-codex
DROID_REASONING=low
PORT=4000
HOST=localhost
```

## How this demo is built
- Server (`src/server/`)
  - src/server/index.ts: Bun HTTP server + static files + API
  - src/server/chat.ts: Runs `droid exec` and streams SSE
  - src/server/repo.ts: Points Droid at `./repos/<first-folder>`
  - src/server/prompt.ts: System prompt and formatting
  - src/server/stream.ts: Parses debug output; strips local paths
- Client (`src/components/chat/`, `src/hooks/`)
  - src/components/chat/ChatWindow.tsx: UI container
  - src/hooks/useChat.ts: Streams events; merges assistant chunks
  - src/hooks/useDrag.ts, src/hooks/useResize.ts: Window behavior

## Variations you can build
Keep this UI and swap the data source behind the chat:
- Files & Docs: index PDFs/Markdown and answer questions from them
- Website: crawl/ingest content and chat with your site
- Database: add read queries (and gated writes) for internal tools

## Customize
- Prompt: edit `src/server/prompt.ts`
- Repo selection: edit `src/server/repo.ts`
- Sounds/UX: `src/lib/sounds.ts`, CSS in `public/styles/`

## Scripts
- Dev: `bun dev` (serves at http://localhost:4000)
- Build (client only): `bun build` (writes to `public/`)

## Notes
- This repo is a demo, not a framework
- Droid Exec can power agents on a VPS with strict, explicit permissions
- Autonomy levels let you scale from read‑only → edits → CI tasks
