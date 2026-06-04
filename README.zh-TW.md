# ⚡ SparkIdea

**繁體中文** ｜ [English](./README.md)

> 在寫程式的當下捕捉稍縱即逝的開發靈感 —— 不打斷手感。

SparkIdea 是一套 **CLI + Claude Code skill**,讓你在工作途中把一個念頭、重構點子或「碎碎念」隨手記下後繼續做事。AI 會**參考當前對話的 context** 分析這個想法,提煉標籤與「消解指代後的摘要」,把所有資訊存進一個全域的 SQLite 檔,然後只回你一句話。日後可依關鍵字、標籤、專案或分類把它們全部搜回來,並把過去的點子展開成計畫。

```
你：   /idea 把這個 selector memoize 起來避免重算
Claude：[已記錄] #perf: memoize 該 selector 避免重算
```

就這樣。不偏題、不擴寫、不污染 context。

---

## 目錄

- [動機](#動機)
- [運作原理](#運作原理)
- [需求](#需求)
- [安裝](#安裝)
- [使用](#使用)
- [CLI 參考](#cli-參考)
- [資料模型](#資料模型)
- [設計決策](#設計決策)
- [開發](#開發)
- [解除安裝](#解除安裝)
- [授權](#授權)

## 動機

當你深陷在一段 AI 輔助開發、忽然冒出一個側邊想法(「這裡應該加 retry backoff」「這個 guard 該抽到 shared module」),你會面臨一個壞選擇:停下來追它(失去專注),或忽略它(失去點子)。SparkIdea 給你第三個選項 —— 一句話記下來,然後保持手感。因為捕捉發生在**對話之中**,AI 能在存檔前釐清「這個」「這裡」到底指什麼。

## 運作原理

```
CLI (sparkidea)   ── 對 ~/.ideas.db 的儲存引擎；也能單獨在終端機使用
Skill             ── ~/.claude/skills/sparkidea/  (SKILL.md + 自帶的 script 副本)
斜線命令           ── /idea   → 用對話 context 分析、存入、回一句
                     /ideas  → 直接在主 context 內查詢(查詢結果就是要看的)
```

- **無 MCP server、無常駐程序。** Skill 是自足的,直接呼叫自帶 script 寫入 SQLite。Script 只用 Bun 內建的 `bun:sqlite` —— 零 runtime 依賴。
- **記錄發生在主執行緒**(而非盲的 subagent),這樣語意分析才能用到周遭對話。靠嚴格的「只回一句」維持 context 足跡極小。
- **搜尋使用 FTS5 `trigram` 索引**,涵蓋 `content` + `summary`,所以子字串與中文查詢都有效 —— 連省略句也能透過它的還原摘要被搜到。

## 需求

- [Bun](https://bun.sh) ≥ 1.1
- [Claude Code](https://claude.com/claude-code)

## 安裝

以下任一方式裝完後,請**重開 Claude Code**(或開新 session)讓 skill 與斜線命令載入。

### 方式 A — `npx skills add`(不需 Bun 套件)

```bash
npx skills add -g RayChang/sparkidea
```

這會把自足的 skill(含自帶 script)裝到 `~/.claude/skills/`。Skill 立刻就能用**自然語言**觸發(「幫我記一下…」)。若也想要 `/idea`、`/ideas` 斜線命令,再跑一次性的補裝:

```bash
bun run ~/.claude/skills/sparkidea/scripts/index.ts install
```

> 註:`npx skills add` 會嘗試裝到多種 agent;若看到 `PromptScript does not support global skill installation` 的失敗訊息,那只是其中一個無關的 target,**Claude Code 不受影響**。

### 方式 B — Bun 全域套件(附帶終端機 CLI)

```bash
bun add -g sparkidea     # 提供 `sparkidea` 終端機 CLI
sparkidea install        # 安裝 skill + /idea、/ideas 命令
```

### 方式 C — 從本地 clone

```bash
git clone https://github.com/RayChang/sparkidea.git && cd sparkidea
bun install
bun link                                          # 選用:把全域 `sparkidea` CLI 放上 PATH
bun run skills/sparkidea/scripts/index.ts install # 安裝 skill + 斜線命令
```

## 使用

### 捕捉 — `/idea`

```
/idea ngrx selector 應該 memoize 避免重算
/idea #perf 把 dashboard 的 polling 換成 SSE       # 明確指定 #perf 標籤
/idea 這個 guard 應該抽到 shared module             # 「這個」由 context 還原
```

AI 會推導以下欄位(都可省略,且絕不瞎掰):

| 欄位       | 範例                                       | 說明                                   |
| ---------- | ------------------------------------------ | -------------------------------------- |
| `label`    | `perf`                                     | 明確的 `#label`,或一個關鍵字          |
| `summary`  | `把 dashboard 的輪詢改成 SSE 推送`          | 指代/引用**由 context 還原**           |
| `context`  | `重構 bkw 的即時報表時`                     | 當時在做什麼                           |
| `refs`     | `src/dashboard/poll.ts,src/sse/stream.ts`  | 相關檔案                               |
| `category` | `refactor`                                 | bug / refactor / feature / perf / …    |

回應永遠只有一句:`[已記錄] #<label>: <summary>`。

### 取回 — `/ideas`

```
/ideas SSE              # 模糊關鍵字搜尋(content + summary,FTS5)
/ideas #refactor        # 精準標籤篩選
/ideas @bkw auth        # 專案篩選 + 關鍵字
/ideas                  # 列出全部,最新在前
```

`#word` → 標籤、`@word` → 專案、其餘 → 關鍵字。結果回來後,可請 AI 幫你彙整、分組、計數,或展開成重構計畫。

你也可以直接用自然語言 —— 「幫我記一下…」/「之前那些 perf 的點子」—— skill 會依意圖觸發。

## CLI 參考

同一個引擎也能直接在終端機用:

```bash
sparkidea add "<content>" [--label x] [--summary s] [--context c] \
                          [--refs "a.ts,b.ts"] [--category t] [--project p] [--json]
sparkidea search [keyword] [--label l] [--project p] [--category t] [--limit n] [--json]
sparkidea list [--limit n] [--json]

sparkidea install      # 安裝 skill(自帶 script)+ 斜線命令
sparkidea uninstall    # 移除 skill + 受管理的斜線命令(保留你的資料)
sparkidea --version
sparkidea --help
```

專案名稱與 git 分支會在寫入當下從工作目錄自動偵測。

## 資料模型

所有點子存在一個全域資料庫 `~/.ideas.db`(可用環境變數 `SPARKIDEA_DB` 覆寫)。

```sql
CREATE TABLE ideas (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  project    TEXT,        -- process.cwd() 的目錄名
  branch     TEXT,        -- git branch --show-current(可為 null)
  label      TEXT,        -- 明確指定或由 LLM 提煉的關鍵字
  summary    TEXT,        -- 消解指代後的一句摘要
  context    TEXT,        -- 簡短的「當時在做什麼」
  refs       TEXT,        -- 逗號分隔的相關檔案路徑
  category   TEXT,        -- bug / refactor / feature / perf / question / …
  content    TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

`label`、`summary`、`context`、`refs`、`category` 由 AI 在捕捉當下從**對話 context** 推導;`content` 維持逐字原文。一個涵蓋 `content` + `summary` 的 FTS5(`trigram`)索引提供關鍵字搜尋,並由 trigger 自動同步。既有資料庫在開啟時會自動遷移(`ALTER TABLE` + 重建索引)。

## 設計決策

- **CLI + skill,不用 MCP。** 一旦 CLI 直接寫 SQLite,MCP server 只是多一個常駐程序與註冊、毫無好處。Skill 自帶 script 並直接呼叫它。
- **在主執行緒記錄,而非 subagent。** Subagent 從一個全新、看不到對話的 context 開始 —— 而那正是 summary 需要的 context。污染改用「單次短 CLI 呼叫 + 嚴格一句回應」來控制。
- **`trigram` 而非 `unicode61`。** 預設 tokenizer 對中文分詞很差;`trigram` 對中英文都提供真正的子字串比對。短關鍵字(1–2 字)trigram 無法索引,以 `LIKE` fallback 補上。
- **絕不瞎掰欄位。** Skill 被要求:無法判定的欄位寧可省略,也不要捏造。

## 開發

```bash
bun install
bun run skills/sparkidea/scripts/index.ts --help   # 從原始碼跑 CLI
bun run typecheck                                   # tsc --noEmit
SPARKIDEA_DB=/tmp/dev.db bun run skills/sparkidea/scripts/index.ts add "test idea" --label demo
```

原始碼結構 —— skill 目錄就是唯一真相(`npx skills add` 原樣搬運它,npm 的 `bin` 也指向它的 `scripts/`):

```
skills/sparkidea/
  SKILL.md             行為契約(用 context 分析 → 存入 → 回一句)
  commands/            /idea 與 /ideas 斜線命令模板(隨 skill 一起搬運)
  scripts/
    index.ts           CLI 分派(add / search / list / install / uninstall)
    actions.ts         add/search/list 處理 + 參數解析
    db.ts              bun:sqlite schema、遷移、FTS5
    context.ts         專案名稱 + git 分支偵測
    install.ts         安裝/解除 skill + 斜線命令
```

## 解除安裝

```bash
sparkidea uninstall      # 移除 skill + /idea、/ideas(你的 ~/.ideas.db 會保留)
bun remove -g sparkidea  # 移除套件本身
```

## 授權

[MIT](./LICENSE) © Ray Chang
