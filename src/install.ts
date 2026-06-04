import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const MANAGED_MARKER = "sparkidea-managed";

/** Absolute path to the package root (the directory above src/). */
const PACKAGE_ROOT = resolve(import.meta.dir, "..");
const COMMANDS_SRC = join(PACKAGE_ROOT, "commands");
const SKILL_SRC = join(PACKAGE_ROOT, "skill");
const SRC_DIR = join(PACKAGE_ROOT, "src");

const CLAUDE_DIR = join(homedir(), ".claude");
const COMMANDS_DEST = join(CLAUDE_DIR, "commands");
const SKILL_DEST = join(CLAUDE_DIR, "skills", "sparkidea");

/**
 * Install the self-contained skill: SKILL.md plus a copy of the storage script
 * under scripts/. The script only uses bun:sqlite + node builtins, so no
 * node_modules need to travel with it.
 */
function installSkill(): void {
  mkdirSync(SKILL_DEST, { recursive: true });
  copyFileSync(join(SKILL_SRC, "SKILL.md"), join(SKILL_DEST, "SKILL.md"));
  cpSync(SRC_DIR, join(SKILL_DEST, "scripts"), { recursive: true });
}

/** Copy bundled slash commands into the user's global commands directory. */
function installCommands(): string[] {
  mkdirSync(COMMANDS_DEST, { recursive: true });
  const installed: string[] = [];
  for (const file of readdirSync(COMMANDS_SRC)) {
    if (!file.endsWith(".md")) continue;
    copyFileSync(join(COMMANDS_SRC, file), join(COMMANDS_DEST, file));
    installed.push(file.replace(/\.md$/, ""));
  }
  return installed;
}

/** Remove only the slash commands that we own (carry the managed marker). */
function uninstallCommands(): string[] {
  if (!existsSync(COMMANDS_DEST)) return [];
  const removed: string[] = [];
  for (const file of readdirSync(COMMANDS_SRC)) {
    if (!file.endsWith(".md")) continue;
    const dest = join(COMMANDS_DEST, file);
    if (existsSync(dest) && readFileSync(dest, "utf8").includes(MANAGED_MARKER)) {
      rmSync(dest);
      removed.push(file.replace(/\.md$/, ""));
    }
  }
  return removed;
}

/** Full install: self-contained skill + slash commands. No MCP server. */
export function install(): void {
  console.log("⚡ Installing SparkIdea…\n");

  installSkill();
  console.log(`✓ Skill installed → ${SKILL_DEST}`);
  console.log("  (SKILL.md + bundled storage script under scripts/)");

  const commands = installCommands();
  console.log(`✓ Slash commands installed → ${COMMANDS_DEST}`);
  console.log(`  ${commands.map((c) => `/${c}`).join("  ")}`);

  if (!Bun.which("sparkidea")) {
    console.log(
      "\nℹ The slash commands call the bundled skill script directly, so the global",
    );
    console.log(
      "  `sparkidea` CLI is optional. For terminal use, run `bun add -g sparkidea`",
    );
    console.log("  (or `bun link` from a local clone).");
  }

  console.log("\nDone. Ideas are stored in ~/.ideas.db (created on first use).");
  console.log("Restart Claude Code (or open a new session) so the skill and commands load.");
}

/** Full uninstall: remove the skill + our slash commands. Data is preserved. */
export function uninstall(): void {
  console.log("Removing SparkIdea…\n");

  if (existsSync(SKILL_DEST)) {
    rmSync(SKILL_DEST, { recursive: true });
    console.log(`✓ Skill removed → ${SKILL_DEST}`);
  } else {
    console.log("• Skill was not installed");
  }

  const removed = uninstallCommands();
  console.log(
    removed.length > 0
      ? `✓ Slash commands removed: ${removed.map((c) => `/${c}`).join("  ")}`
      : "• No managed slash commands found",
  );

  console.log("\nNote: your ideas database (~/.ideas.db) was left untouched.");
}
