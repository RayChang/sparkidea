import { basename } from "node:path";

/**
 * Resolve the current project name from the working directory.
 * Falls back to "unknown" when cwd cannot be determined.
 */
export function getProject(): string {
  try {
    return basename(process.cwd()) || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Resolve the current git branch via `git branch --show-current`.
 * Returns null when not inside a git repository or git is unavailable.
 */
export function getBranch(): string | null {
  try {
    const proc = Bun.spawnSync(["git", "branch", "--show-current"], {
      stdout: "pipe",
      stderr: "ignore",
    });
    if (proc.exitCode !== 0) return null;
    const branch = proc.stdout.toString().trim();
    return branch.length > 0 ? branch : null;
  } catch {
    return null;
  }
}
