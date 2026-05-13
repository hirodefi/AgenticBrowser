# AgenticBrowser — Build Plan

> A fully autonomous browser runtime for AI agents.
> Zero human intervention. If a human can access it, the agent accesses it automatically.

---

## Core Philosophy

**No human handoff. Ever.**

The browser itself is built to be indistinguishable from a real human browser. When it encounters challenges (Cloudflare, CAPTCHA, bot checks), it handles them autonomously using:

1. **Stealth-first design** — Real Chrome binary, realistic fingerprint, human-like behavior. Most challenges never trigger.
2. **Autonomous challenge solving** — When challenges appear, solve them: Cloudflare auto-waits, CAPTCHA checkbox clicking, audio challenges with speech-to-text.
3. **Session persistence** — Cookies, storage, and profile data persist across sessions like a real browser.
4. **Intelligent recovery** — If blocked, try alternative access paths automatically.

---

## Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Language | **TypeScript** | Fast iteration, Playwright native, MCP SDK native |
| Browser | **Playwright + real Chrome** | Full CDP access, real Chrome TLS fingerprint, auto-wait |
| Agent Interface | **MCP Server** | Works with Claude, Cursor, any MCP client |
| CLI | **Commander.js** | Direct terminal usage |
| HTTP API | **Fastify** | Remote usage |
| Content Extraction | **@mozilla/readability** + custom | Clean article extraction |
| Cache | **SQLite** (better-sqlite3) | Profiles, site data, zero-config |
| Markdown | **turndown** | HTML → clean markdown |

---

## Architecture

```
┌──────────────────────────────────────────────────┐
│                   Agent Layer                     │
│   MCP Server │ CLI │ HTTP API                     │
├──────────────────────────────────────────────────┤
│               Command Router                      │
│   open │ observe │ read │ act │ extract │ verify  │
│   recover │ debug │ navigate                      │
├──────────────────────────────────────────────────┤
│            Autonomous Solver                      │
│   Cloudflare auto-wait, CAPTCHA solver,           │
│   challenge detection + resolution,               │
│   human-like mouse/keyboard simulation            │
├──────────────────────────────────────────────────┤
│            Access State Machine                   │
│   Classifies pages: READABLE, CHALLENGE,          │
│   LOGIN, PAYWALL, BLOCKED, etc.                   │
├──────────────────────────────────────────────────┤
│           Smart Reading Engine                     │
│   Multi-source: DOM → Readability → JSON-LD →     │
│   Structured → Print → PDF → Fallback             │
├──────────────────────────────────────────────────┤
│          Stealth Browser Runtime                   │
│   Real Chrome binary, realistic fingerprint,      │
│   persistent profiles, network-level auth,        │
│   human-like behavior simulation                  │
└──────────────────────────────────────────────────┘
```

---

## Stealth Strategy — How We Pass Everything

### Layer 1: Real Chrome Binary
- Use `channel: 'chrome'` — launches the actual Chrome installed on the system
- Real TLS fingerprint (Chrome's BoringSSL, NOT Node.js OpenSSL)
- Real HTTP/2 + HTTP/3 stack
- Real plugin/mimetype support
- This alone defeats 70% of bot detection

### Layer 2: Automation Marker Removal
- Remove `navigator.webdriver` flag
- Patch `chrome.runtime`, `chrome.loadTimes`, `chrome.csi`, `chrome.app`
- Fix `navigator.permissions`, `navigator.plugins`, `navigator.languages`
- Fix WebGL vendor/renderer strings
- Remove `--enable-automation` Chrome flag
- Patch `navigator.webdriver` via CDP

### Layer 3: Realistic Fingerprint
- Consistent canvas fingerprint (not randomized per-page)
- WebGL renderer matching real hardware
- Realistic `navigator.hardwareConcurrency`, `deviceMemory`
- Proper `Accept-Language`, `Accept-Encoding` headers
- Consistent screen/viewport dimensions

### Layer 4: Human-Like Behavior
- Mouse movement with Bézier curves + natural acceleration
- Variable typing speed with realistic keystroke timing
- Natural scroll patterns (not instant jumps)
- Random micro-pauses before actions
- Page interaction history (cookies, localStorage persist)

### Layer 5: Challenge Solving
- **Cloudflare Turnstile**: Auto-waits 5-15s, resolves with stealth browser
- **Cloudflare JS Challenge**: Waits for JS execution, no interference
- **Cloudflare Managed Challenge**: Simulates human interaction + waits
- **reCAPTCHA v2 Checkbox**: Human-like mouse move to checkbox + click
- **reCAPTCHA v2 Audio**: Switches to audio challenge, STT transcription
- **reCAPTCHA v3**: Good fingerprint = high score, auto-passes
- **hCaptcha**: Checkbox click + wait, similar to reCAPTCHA
- **Simple click CAPTCHAs**: Detected and clicked automatically

### Layer 6: Session Persistence
- Persistent browser profiles (cookies, localStorage, sessionStorage)
- Profile reuse across agent sessions
- Cookie jar per domain
- Logged-in sessions survive restarts

---

## Project Structure

```
AgenticBrowser/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── server.ts                    # MCP server
│   ├── cli.ts                       # CLI entry
│   │
│   ├── core/
│   │   ├── browser.ts               # Stealth browser pool
│   │   ├── stealth.ts               # All stealth patches
│   │   ├── session.ts               # Session + profile management
│   │   └── config.ts                # Configuration
│   │
│   ├── solver/
│   │   ├── solver.ts                # Autonomous challenge solver orchestrator
│   │   ├── cloudflare.ts            # Cloudflare challenge handler
│   │   ├── captcha.ts               # reCAPTCHA/hCaptcha solver
│   │   ├── mouse-simulator.ts       # Human-like mouse movement
│   │   ├── keyboard-simulator.ts    # Human-like keyboard input
│   │   └── audio-stt.ts             # Audio CAPTCHA → speech-to-text
│   │
│   ├── state-machine/
│   │   ├── classifier.ts            # Page state classification
│   │   ├── detectors/
│   │   │   ├── cloudflare.ts
│   │   │   ├── captcha.ts
│   │   │   ├── login-wall.ts
│   │   │   ├── paywall.ts
│   │   │   ├── rate-limit.ts
│   │   │   └── error-page.ts
│   │   └── types.ts
│   │
│   ├── commands/
│   │   ├── open.ts
│   │   ├── observe.ts
│   │   ├── read.ts
│   │   ├── act.ts
│   │   ├── extract.ts
│   │   ├── verify.ts
│   │   ├── recover.ts
│   │   ├── debug.ts
│   │   └── navigate.ts
│   │
│   ├── reading/
│   │   ├── engine.ts
│   │   ├── dom-reader.ts
│   │   ├── readability.ts
│   │   ├── structured-data.ts
│   │   ├── table-extractor.ts
│   │   └── scoring.ts
│   │
│   ├── interaction/
│   │   ├── element-resolver.ts
│   │   ├── accessibility-tree.ts
│   │   ├── actions.ts
│   │   └── auto-wait.ts
│   │
│   ├── recovery/
│   │   ├── strategies.ts
│   │   ├── reader-mode.ts
│   │   ├── print-mode.ts
│   │   ├── api-fallback.ts
│   │   └── viewport-switch.ts
│   │
│   ├── cache/
│   │   ├── store.ts
│   │   ├── site-profiles.ts
│   │   └── content-cache.ts
│   │
│   └── utils/
│       ├── markdown.ts
│       ├── html-cleaner.ts
│       ├── screenshot.ts
│       └── logger.ts
│
├── README.md
└── AGENTS.md
```

---

## MCP Tools

9 tools, no handoff:

| Tool | Purpose |
|---|---|
| `browser_open` | Open URL, auto-handle challenges, return state |
| `browser_observe` | Page summary + interactive elements |
| `browser_read` | Clean content extraction (markdown/JSON) |
| `browser_act` | Intent-based interaction (click, type, scroll) |
| `browser_extract` | Schema-driven structured data extraction |
| `browser_verify` | Goal/condition verification |
| `browser_recover` | Try alternative access methods |
| `browser_debug` | Console, network, screenshot bundle |
| `browser_navigate` | Back, forward, reload, goto |

---

## Build Phases

### Phase 1: Core Runtime + Stealth
Stealth browser, state machine, basic commands.

### Phase 2: Reading Engine + Interaction
Smart content extraction, intent-based actions.

### Phase 3: Autonomous Solver + Recovery
CAPTCHA solving, challenge handling, recovery strategies.

### Phase 4: MCP Server + Cache + Deploy
MCP server, CLI, cache, GitHub deploy.

---

## Deployment

- **Repo:** https://github.com/hirodefi/AgenticBrowser
- **Git:** hirodefi (bloqwire@gmail.com)
- **Use with Claude:** MCP stdio server
- **Use standalone:** `npx agentic-browser open https://example.com`
