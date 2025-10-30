import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

export type RepoInfo = { repoRoot: string; workdir: string };

export async function getLocalRepoInfo(): Promise<RepoInfo> {
  const base = "./repos";
  const entries = await readdir(base, { withFileTypes: true });
  const first = entries.find((e) => e.isDirectory());
  if (!first) {
    throw new Error("no repository found under ./repos");
  }
  const repoDir = join(base, first.name);
  await stat(repoDir);
  return { repoRoot: repoDir, workdir: repoDir };
}

