---
description: ⚡ Capture a fleeting idea into SparkIdea (analysed with full conversation context)
argument-hint: "[your idea, optionally starting with #label]"
allowed-tools: Bash(bun run*)
---
<!-- sparkidea-managed: do not edit; reinstalled by `sparkidea install` -->

Capture this developer idea. The idea is often related to the current conversation, so analyse
it **using the full context of this conversation** — do NOT delegate to a subagent (a subagent
cannot see this conversation, which is exactly what we need here).

The raw idea text is:

$ARGUMENTS

Derive these fields from the idea **and the surrounding conversation**, then store once. Keep
each one short; omit any you genuinely cannot determine (don't fabricate):

- **label** — if the text starts with a `#word` token use that (without `#`); else ONE concise
  lowercase technical keyword (e.g. perf, refactor, ngrx, auth).
- **summary** — the idea with pronouns/references RESOLVED from context (e.g. "把這個改成 SSE"
  → "把 dashboard 的輪詢改成 SSE"). This is the highest-value field; always try to fill it.
- **context** — a short "what we were doing" note (e.g. "重構 bkw 的 auth guard 時").
- **refs** — comma-separated file paths being discussed/edited (e.g. "src/auth/guard.ts").
- **category** — one of bug / refactor / feature / perf / question (or similar) if clear.

Store it by running exactly once (omit flags you don't have; pass content verbatim):

```bash
bun run "$HOME/.claude/skills/sparkidea/scripts/index.ts" add "<content>" \
  --label <label> --summary "<summary>" --context "<context>" \
  --refs "<a.ts,b.ts>" --category <category>
```

Then respond with EXACTLY one short line and nothing else:

```
[已記錄] #<label>: <content_summary>
```

No advice, no suggestions, no follow-up, no expansion. One line, then stop.
