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

// This file lives at <root>/skills/sparkidea/scripts/install.ts
const SCRIPTS_DIR = import.meta.dir;
const SKILL_SRC = resolve(SCRIPTS_DIR, ".."); // <root>/skills/sparkidea (SKILL.md + scripts/ + commands/)
// Command templates live inside the skill dir so they travel with `npx skills add`.
const COMMANDS_SRC = join(SKILL_SRC, "commands");

const CLAUDE_DIR = join(homedir(), ".claude");
const COMMANDS_DEST = join(CLAUDE_DIR, "commands");
const SKILL_DEST = join(CLAUDE_DIR, "skills", "sparkidea");

/**
 * Install the self-contained skill directory (SKILL.md + bundled scripts/) into
 * the user's global skills folder. The scripts only use bun:sqlite + node
 * builtins, so no node_modules travel with them. No-op if the source already IS
 * the install destination (e.g. invoked from the installed skill itself).
 */
function installSkill(): void {
  if (resolve(SKILL_SRC) === resolve(SKILL_DEST)) return;
  mkdirSync(SKILL_DEST, { recursive: true });
  cpSync(SKILL_SRC, SKILL_DEST, { recursive: true });
}

/** Copy bundled slash commands into the user's global commands directory. */
function installCommands(): string[] {
  if (!existsSync(COMMANDS_SRC)) return [];
  mkdirSync(COMMANDS_DEST, { recursive: true });
  const installed: string[] = [];
  for (const file of readdirSync(COMMANDS_SRC)) {
    if (!file.endsWith(".md")) continue;
    copyFileSync(join(COMMANDS_SRC, file), join(COMMANDS_DEST, file));
    installed.push(file.replace(/\.md$/, ""));
  }
  return installed;
}

/** Remove only the slash commands that carry our managed marker. */
function uninstallCommands(): string[] {
  if (!existsSync(COMMANDS_DEST)) return [];
  const removed: string[] = [];
  for (const file of readdirSync(COMMANDS_DEST)) {
    if (!file.endsWith(".md")) continue;
    const dest = join(COMMANDS_DEST, file);
    if (readFileSync(dest, "utf8").includes(MANAGED_MARKER)) {
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
  if (commands.length > 0) {
    console.log(`✓ Slash commands installed → ${COMMANDS_DEST}`);
    console.log(`  ${commands.map((c) => `/${c}`).join("  ")}`);
  } else {
    console.log("• No slash command templates found (skill still works via natural language).");
  }

  if (!Bun.which("sparkidea")) {
    console.log("\nℹ The slash commands call the bundled skill script directly, so the global");
    console.log("  `sparkidea` CLI is optional. For terminal use, run `bun add -g sparkidea`.");
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
