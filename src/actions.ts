import { getBranch, getProject } from "./context.ts";
import { type Idea, insertIdea, queryIdeas } from "./db.ts";

/** Minimal flag parser: splits positionals from `--flag value` / `--bool` pairs. */
function parseArgs(argv: string[]): {
  positionals: string[];
  flags: Record<string, string | true>;
} {
  const positionals: string[] = [];
  const flags: Record<string, string | true> = {};
  const alias: Record<string, string> = {
    l: "label",
    p: "project",
    k: "keyword",
    n: "limit",
    s: "summary",
    c: "category",
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--") || arg.startsWith("-")) {
      const raw = arg.replace(/^-+/, "");
      const key = alias[raw] ?? raw;
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith("-")) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

function asString(value: string | true | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatRow(idea: Idea): string {
  const when = idea.created_at;
  const where = [idea.project, idea.branch].filter(Boolean).join("@");
  const tag = idea.label ? `#${idea.label}` : "#-";
  const cat = idea.category ? `  [${idea.category}]` : "";
  const lines = [`[${idea.id}] ${when}  ${tag}${cat}  (${where || "—"})`, `    ${idea.content}`];
  if (idea.summary) lines.push(`    ↳ ${idea.summary}`);
  if (idea.context) lines.push(`    ctx: ${idea.context}`);
  if (idea.refs) lines.push(`    refs: ${idea.refs}`);
  return lines.join("\n");
}

/** `sparkidea add <content...> [--label x] [--project p] [--json]` */
export function cmdAdd(argv: string[]): void {
  const { positionals, flags } = parseArgs(argv);
  const content = positionals.join(" ").trim();
  if (!content) {
    console.error('Usage: sparkidea add "<content>" [--label <label>]');
    process.exit(1);
  }

  const idea = insertIdea({
    project: asString(flags.project) ?? getProject(),
    branch: getBranch(),
    label: asString(flags.label) ?? null,
    summary: asString(flags.summary) ?? null,
    context: asString(flags.context) ?? null,
    refs: asString(flags.refs) ?? null,
    category: asString(flags.category) ?? null,
    content,
  });

  if (flags.json) {
    console.log(JSON.stringify(idea));
  } else {
    const tag = idea.label ? `#${idea.label}` : "#-";
    console.log(`recorded ${tag} (id ${idea.id}) in ${idea.project ?? "—"}`);
  }
}

/** `sparkidea search [keyword] [--label l] [--project p] [--limit n] [--json]` */
export function cmdSearch(argv: string[]): void {
  const { positionals, flags } = parseArgs(argv);
  const keyword = asString(flags.keyword) ?? (positionals.join(" ").trim() || undefined);
  let ideas = queryIdeas({
    keyword,
    label: asString(flags.label),
    project: asString(flags.project),
    category: asString(flags.category),
  });

  const limit = Number(asString(flags.limit));
  if (Number.isFinite(limit) && limit > 0) ideas = ideas.slice(0, limit);

  if (flags.json) {
    console.log(JSON.stringify({ count: ideas.length, ideas }));
    return;
  }
  if (ideas.length === 0) {
    console.log("No matching ideas.");
    return;
  }
  console.log(`${ideas.length} idea(s):\n`);
  console.log(ideas.map(formatRow).join("\n\n"));
}

/** `sparkidea list [--limit n] [--json]` — newest first, optionally capped. */
export function cmdList(argv: string[]): void {
  const { flags } = parseArgs(argv);
  cmdSearch([
    ...(flags.limit ? ["--limit", String(flags.limit)] : []),
    ...(flags.json ? ["--json"] : []),
  ]);
}
