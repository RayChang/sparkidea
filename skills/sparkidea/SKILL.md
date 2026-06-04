---
name: sparkidea
description: Capture a developer's fleeting idea, refactor thought, or "碎碎念" into the global SparkIdea store during coding, and retrieve them later. Use when the user wants to jot down / 記一下 / 閃存 an idea without breaking flow, dumps a quick thought mid-task, or asks to review / search past ideas. Analyses the idea with the current conversation context, then records it with a single short confirmation.
license: MIT
metadata:
  version: "0.1"
  author: ray.chang
---

# SparkIdea ⚡

Quickly capture fleeting development ideas into a global SQLite store (`~/.ideas.db`)
without breaking the developer's flow, and retrieve them later for planning.

The storage engine is the bundled script at:

```
$HOME/.claude/skills/sparkidea/scripts/index.ts
```

Run it with `bun run "<that path>" <subcommand> …`. It only uses Bun's built-in
`bun:sqlite`, so no dependencies are required.

## Recording an idea (analyze → label → store)

A captured idea is usually related to the current conversation, so analyse it **in the main
thread using the full conversation context** — do NOT delegate to a subagent, because a subagent
starts with a fresh context and cannot see this conversation (which would degrade the label and
summary). Pollution is kept minimal another way: a single CLI call plus a strict one-line reply.

1. **Analyze** the idea using the conversation context and derive these fields (keep each short;
   omit any you genuinely cannot determine — never fabricate):
   - **label** — explicit `#label` if given, else ONE concise lowercase keyword (`perf`,
     `refactor`, `ngrx`, `auth`, …).
   - **summary** — the idea with pronouns/references RESOLVED from context (e.g. "把這個改成 SSE"
     → "把 dashboard 的輪詢改成 SSE"). Highest-value field; always try to fill it.
   - **context** — a short "what we were doing" note (e.g. "重構 bkw 的 auth guard 時").
   - **refs** — comma-separated file paths in play (e.g. "src/auth/guard.ts").
   - **category** — bug / refactor / feature / perf / question (or similar) when clear.
2. **Store** it by running, exactly once (omit flags you don't have):
   ```bash
   bun run "$HOME/.claude/skills/sparkidea/scripts/index.ts" add "<content>" \
     --label <label> --summary "<summary>" --context "<context>" \
     --refs "<a.ts,b.ts>" --category <category>
   ```
   Pass the idea **verbatim** as content — never rewrite or expand it.
3. Respond with exactly ONE short line and nothing else:
   ```
   [已記錄] #<label>: <content_summary>
   ```

**Do not** add advice, suggestions, expansions, or follow-up questions. One line, then stop —
keep the developer focused on their task.

## Retrieving ideas

Retrieval is wanted in the main context, so run it directly (no subagent needed):

```bash
bun run "$HOME/.claude/skills/sparkidea/scripts/index.ts" search "<keyword>" --label <label> --project <project> --category <category>
```

All flags are optional. Keyword search runs over both `content` and the context-resolved
`summary`. With no arguments it lists everything, newest first. Add `--json` when you need to
parse rows programmatically (rows include summary, context, refs, category). Once you have the
rows you may summarise, group, count, or expand them into a refactor plan as the user requests.

## Notes

- Project name and git branch are auto-detected from the working directory at write time.
- Keyword search uses an FTS5 trigram index (substring + CJK aware) with a LIKE fallback for
  1–2 character keywords.
