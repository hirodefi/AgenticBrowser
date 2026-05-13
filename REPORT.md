# AgenticBrowser v1.0 — Project Report

> Fully autonomous browser runtime for AI agents.
> Zero human intervention. If a human can access it, the agent accesses it.

**Repo:** https://github.com/hirodefi/AgenticBrowser
**Author:** hirodefi (bloqwire@gmail.com)
**Date:** May 13, 2026
**Commit:** `a20b938` — Initial release

---

## What It Is

AgenticBrowser is a stealth browser runtime that gives AI agents full, autonomous access to the real web. It uses a real Chrome binary with 13 anti-detection mechanisms, an autonomous challenge solver (Cloudflare, reCAPTCHA, hCaptcha), a multi-source smart reading engine, and an access state machine that classifies every page into one of 11 states. It exposes 9 MCP tools so any AI agent (Claude, Cursor, etc.) can browse the web without any human intervention.

**The core promise: anything a normal human can open and read in their browser should be readable and usable by an AI agent. Automatically.**

---

## What's Built

### Numbers

| Metric | Value |
|---|---|
| Source files | 32 TypeScript files |
| Lines of code | 4,298 |
| TypeScript strict mode | Zero errors |
| Dependencies | 10 runtime, 7 dev |
| MCP tools | 9 |
| Stealth layers | 13 (10 init script + 3 CDP/args) |
| Page state classifiers | 11 states |
| Detectors | 6 (Cloudflare, CAPTCHA, login, paywall, rate limit, error) |
| Solver strategies | 13 (Cloudflare 4, CAPTCHA 4, orchestrator 5) |
| Recovery strategies | 7 |
| Public API exports | 23 |

### Architecture (5 layers)

```
Agent Layer        MCP Server / CLI / SDK
Command Router     9 commands
Autonomous Solver  Cloudflare + CAPTCHA auto-solve
State Machine      11 page states, 6 detectors
Stealth Browser    Real Chrome + 13 anti-detection layers
```

---

## Core Systems

### 1. Stealth Browser Runtime (`src/core/`)

Launches real Chrome (not Chromium) with full anti-detection:

| Layer | What It Does |
|---|---|
| Real Chrome binary | Authentic TLS fingerprint (BoringSSL), real HTTP/2, real plugin support |
| navigator.webdriver removal | Sets to `undefined`, removes the #1 bot detection vector |
| Chrome object simulation | Spoofs `chrome.runtime`, `chrome.loadTimes`, `chrome.csi`, `chrome.app` |
| Permissions API | Overrides `navigator.permissions.query` for consistent behavior |
| Plugins + MIME types | Injects 3 realistic plugins, 4 MIME types matching real Chrome |
| Hardware properties | `hardwareConcurrency=8`, `deviceMemory=8`, `platform=Win32`, `languages=en-US,en` |
| WebGL fingerprint | Overrides vendor/renderer strings for WebGL and WebGL2 contexts |
| toString patching | WeakMap-based native code spoofing so patched functions look unmodified |
| CDC property removal | Deletes `cdc_adoQpoasnfa76pfcZLmcfl_*` automation markers |
| Shadow DOM + misc | Fixes iframe contentWindow, console.debug, Notification permission |
| Chrome launch args | 20 stealth args (disables automation flags, infobars, phishing detection, etc.) |
| Default args blocked | Removes `--enable-automation` and `--enable-blink-features=IdleDetection` |
| CDP-level overrides | Protocol-level webdriver removal, locale override, user agent with brand metadata |

### 2. Access State Machine (`src/state-machine/`)

Every page is classified into exactly one of 11 states:

| State | Meaning |
|---|---|
| `READABLE` | Content fully available, no interaction needed |
| `INTERACTIVE` | Page loaded with interactive elements |
| `LOADING` | Still loading |
| `CHALLENGE_REQUIRED` | Cloudflare/CAPTTCHA challenge detected |
| `LOGIN_REQUIRED` | Login wall detected |
| `PAYWALL_REQUIRED` | Paywall detected |
| `RATE_LIMITED` | Rate limited (429, quota exceeded) |
| `BLOCKED` | IP/access blocked (403, Cloudflare block) |
| `BROKEN` | 404, 500, DNS error, timeout |
| `REDIRECTING` | Redirect in progress |
| `UNKNOWN` | Cannot determine state |

Classification uses 6 parallel detectors with priority ordering:
1. Error page detector (404, 500, 403, 503, DNS, timeout)
2. Cloudflare detector (Turnstile, JS challenge, managed challenge, block)
3. CAPTCHA detector (reCAPTCHA v2/v3, hCaptcha, simple click)
4. Login wall detector (forms, OAuth buttons, URL/title patterns)
5. Paywall detector (hard/soft/metered, blurred content)
6. Rate limit detector (text patterns, retry-after extraction)

### 3. Autonomous Solver (`src/solver/`)

The solver is the key differentiator — it handles challenges with zero human intervention:

**Cloudflare solver (4 strategies):**
1. Click Turnstile checkbox via iframe with human-like Bezier mouse movement
2. Click challenge buttons (7 selector patterns)
3. Simulate human presence (natural mouse curves, micro-scrolls)
4. Poll for resolution (checks title, DOM, success indicators, timeout 30s)

**CAPTCHA solver (4 strategies):**
1. reCAPTCHA v2 checkbox — Bezier mouse curve to checkbox, human-like click with random offset
2. reCAPTCHA audio challenge — switches to audio mode, downloads audio, STT transcription (hook for Whisper/API)
3. hCaptcha checkbox — same human-like mouse approach
4. Simple click CAPTCHAs — 4 selector patterns

**Orchestrator behavior:**
- Loops up to 3 attempts: classify → solve → re-classify
- Dispatches by challenge type (cloudflare_*, recaptcha_*, hcaptcha, etc.)
- Falls back to trying both Cloudflare and CAPTCHA solvers for unknown types
- Handles rate limits with wait+retry (capped at 10s)

### 4. Smart Reading Engine (`src/reading/`)

Multi-source content extraction with confidence scoring:

| Source | Method | Best For |
|---|---|---|
| Readability | Mozilla Readability + JSDOM + Turndown | Articles, blog posts, news |
| Main content | DOM selector search (article, main, .content, etc.) | General pages |
| Structured data | JSON-LD extraction from script tags | Product pages, recipes, events |
| Body fallback | Full body with noise stripped | Last resort |

Each source is scored (0-1) on text length, structure, and method reliability. The highest-scored result is returned.

Also extracts:
- Tables (headers + rows from `<table>` elements)
- Links (text + href, limited to 100)
- Page metadata (description, OpenGraph, JSON-LD, canonical URL, author, date)

### 5. Intent-Based Interaction (`src/interaction/`)

Elements are found by natural language intent, not CSS selectors:

```typescript
actOnPage({ action: 'click', intent: 'the pricing tab' })
actOnPage({ action: 'type', intent: 'email input', value: 'test@example.com' })
```

The resolver:
1. Gathers all interactive elements (a, button, input, select, [role], [tabindex])
2. Scores each against the intent text (exact match, partial match, word boundaries, role bonus)
3. Picks the highest-scored element
4. Performs the action with human-like mouse movement and timing

Supports: click, type, scroll, select, hover, press.

### 6. Recovery System (`src/commands/recover.ts`)

7 strategies tried sequentially when a page is blocked:

1. **Reload** — simple page reload
2. **Re-solve challenges** — runs auto-solve loop again (2 attempts)
3. **Reader mode** — forces Readability extraction even on blocked pages
4. **Print version** — appends `?print=1` and reads the print view
5. **Mobile viewport** — switches to 375x812, re-classifies, resets
6. **Wait + retry** — 5s wait, reload, 2s wait, re-classify
7. **Scroll load** — scrolls to trigger lazy-loaded content

### 7. Cache + Site Profiles (`src/cache/`)

SQLite-backed persistence:
- **Content cache** — stores extracted content by URL hash with configurable TTL (default 1h)
- **Site profiles** — per-domain records: best read method, content selector, challenge type, load time, success/fail counts
- **Auto-cleanup** — expired entries pruned on server start

---

## 9 MCP Tools

| Tool | Input | Output |
|---|---|---|
| `browser_open` | url, goal | status, accessState, title, challengesSolved, metadata |
| `browser_observe` | level | summary, interactiveElements, forms, links, accessState |
| `browser_read` | scope, format, max_length | title, content (markdown/text/html), confidence, source, wordCount, tables, links |
| `browser_act` | action, intent, value | success, description, afterState |
| `browser_extract` | schema (JSON) | data matching schema, count |
| `browser_verify` | goal | verified, evidence |
| `browser_recover` | goal | recovered, method, accessState, content, attempts |
| `browser_debug` | include_console, include_network, include_screenshot, include_html | console[], network[], domStats, screenshot, html, cookies |
| `browser_navigate` | action, url | success, url, title, accessState |

---

## File Map

```
AgenticBrowser/
├── src/
│   ├── index.ts              (20 lines)   Public API — 23 exports
│   ├── server.ts             (239 lines)  MCP server — 9 tools
│   ├── cli.ts                (174 lines)  CLI — 9 subcommands
│   ├── core/
│   │   ├── browser.ts        (151 lines)  Stealth browser pool
│   │   ├── config.ts         (51 lines)   Configuration
│   │   ├── session.ts        (62 lines)   Session management
│   │   └── stealth.ts        (287 lines)  13 anti-detection mechanisms
│   ├── solver/
│   │   ├── solver.ts         (119 lines)  Orchestrator — auto-solve loop
│   │   ├── cloudflare.ts     (222 lines)  Cloudflare challenge solver
│   │   └── captcha.ts        (335 lines)  reCAPTCHA + hCaptcha solver
│   ├── state-machine/
│   │   ├── types.ts          (158 lines)  11 states, 13 interfaces
│   │   ├── classifier.ts     (187 lines)  Parallel detector runner
│   │   └── detectors/
│   │       ├── cloudflare.ts (113 lines)  CF Turnstile/JS/managed/block
│   │       ├── captcha.ts    (80 lines)   reCAPTCHA/hCaptcha/simple
│   │       ├── error-page.ts (64 lines)   404/500/403/503/DNS/timeout
│   │       ├── login-wall.ts (101 lines)  Forms + OAuth + keywords
│   │       ├── paywall.ts    (88 lines)   Hard/soft/metered/blurred
│   │       └── rate-limit.ts (53 lines)   429/quota/retry-after
│   ├── commands/
│   │   ├── open.ts           (82 lines)   open + auto-solve
│   │   ├── observe.ts        (134 lines)  page summary
│   │   ├── read.ts           (13 lines)   content extraction
│   │   ├── act.ts            (29 lines)   intent actions
│   │   ├── extract.ts        (158 lines)  schema extraction
│   │   ├── verify.ts         (104 lines)  goal verification
│   │   ├── recover.ts        (140 lines)  7 recovery strategies
│   │   ├── debug.ts          (172 lines)  diagnostics bundle
│   │   └── navigate.ts       (65 lines)   back/forward/reload/goto
│   ├── reading/
│   │   ├── engine.ts         (339 lines)  4-source extraction + scoring
│   │   └── structured-data.ts (60 lines)  JSON-LD + OpenGraph + meta
│   ├── interaction/
│   │   ├── accessibility-tree.ts (83 lines)  interactive element extraction
│   │   └── actions.ts        (218 lines)  intent resolver + 6 action types
│   └── cache/
│       └── store.ts          (197 lines)  SQLite cache + site profiles
```

---

## How to Use

### MCP Server (for AI agents like Claude)
```json
{
  "mcpServers": {
    "agentic-browser": {
      "command": "npx",
      "args": ["tsx", "/path/to/AgenticBrowser/src/server.ts"]
    }
  }
}
```

### CLI
```bash
npx tsx src/cli.ts open https://example.com
npx tsx src/cli.ts read --format markdown
npx tsx src/cli.ts act click "the login button"
```

### SDK
```typescript
import { openUrl, readContent, actOnPage } from './src/index.js';

const page = await openUrl('https://example.com');
const content = await readContent({ format: 'markdown' });
await actOnPage({ action: 'click', intent: 'pricing tab' });
```

---

## Known Limitations (v1.0)

1. **Audio CAPTCHA STT** — The `transcribeAudio()` function in `solver/captcha.ts` is a placeholder. It downloads the audio but returns `null`. To make reCAPTCHA audio challenges work, integrate with:
   - OpenAI Whisper API
   - Local Whisper model
   - Google Speech-to-Text

2. **reCAPTCHA image challenges** — Not handled. If the checkbox click triggers an image grid challenge, the solver cannot complete it. The audio fallback path exists but needs the STT integration above.

3. **Headless mode** — Stealth is most effective in headed mode (real Chrome window). Headless mode works but has weaker fingerprint authenticity. For server deployments, use `headless: 'new'` with the new headless Chrome.

4. **No proxy support** — No built-in proxy rotation. If an IP is truly blocked, the recovery system tries alternative access paths but cannot rotate IPs.

5. **Login walls** — Detected and classified but not auto-solved. The system reports `LOGIN_REQUIRED` and the agent must handle credential entry via `browser_act`.

6. **Fastify** — Listed as a dependency but not yet wired up as an HTTP API. The MCP server (stdio) and CLI are the active interfaces.

7. **No tests** — The `tests/` directory structure is planned but no test files are written yet.

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Language | TypeScript | 5.8.3 |
| Runtime | Node.js | 20+ |
| Browser | Playwright + real Chrome | 1.52.0 |
| MCP | @modelcontextprotocol/sdk | 1.12.1 |
| Content extraction | @mozilla/readability | 0.5.0 |
| DOM parsing | jsdom | 26.1.0 |
| HTML→Markdown | turndown | 7.2.0 |
| Database | better-sqlite3 | 11.9.1 |
| CLI | commander | 13.1.0 |
| Schema validation | zod | 4.4.3 |
