#!/usr/bin/env bun
import { cmdAdd, cmdList, cmdSearch } from "./actions.ts";
import { install, uninstall } from "./install.ts";

const VERSION = "0.1.0";

const HELP = `⚡ sparkidea v${VERSION} — capture fleeting dev ideas without breaking flow

Usage:
  sparkidea add "<content>" [--label x] [--summary s] [--context c]
                            [--refs "a.ts,b.ts"] [--category t] [--project p] [--json]
                        Store an idea (project + git branch auto-detected)
  sparkidea search [keyword] [--label l] [--project p] [--category t]
                            [--limit n] [--json]
                        Search ideas (FTS5 over content+summary + exact filters)
  sparkidea list [--limit n] [--json]
                        List ideas, newest first
  sparkidea install     Install the skill (with bundled script) + slash commands
  sparkidea uninstall   Remove the skill + managed slash commands (keeps data)
  sparkidea --version   Print version
  sparkidea --help      Show this help

Ideas are stored globally in ~/.ideas.db (override with SPARKIDEA_DB).`;

function main(): void {
  const [cmd, ...rest] = process.argv.slice(2);

  switch (cmd) {
    case "add":
      cmdAdd(rest);
      return;
    case "search":
      cmdSearch(rest);
      return;
    case "list":
      cmdList(rest);
      return;
    case "install":
      install();
      return;
    case "uninstall":
      uninstall();
      return;
    case "--version":
    case "-v":
      console.log(VERSION);
      return;
    case undefined:
    case "--help":
    case "-h":
      console.log(HELP);
      return;
    default:
      console.error(`Unknown command: ${cmd}\n`);
      console.error(HELP);
      process.exit(1);
  }
}

try {
  main();
} catch (error: unknown) {
  console.error("[sparkidea] error:", error instanceof Error ? error.message : error);
  process.exit(1);
}
