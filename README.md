# AgenticBrowser

> Fully autonomous browser runtime for AI agents.
> Zero human intervention. If a human can access it, the agent accesses it.

## What It Does

AgenticBrowser gives AI agents a real browser that handles the modern web autonomously:

- **Opens any URL** — JavaScript SPAs, iframes, shadow DOM, lazy loading, all handled
- **Auto-solves challenges** — Cloudflare, reCAPTCHA, hCaptcha resolved automatically
- **Reads clean content** — Smart multi-source extraction to markdown
- **Interacts by intent** — "click the login button", "type in the search box"
- **Extracts structured data** — Schema-driven extraction from any page
- **Verifies goals** — "user is logged in", "page contains pricing"
- **Recovers from blocks** — Tries reader mode, print version, viewport switching, etc.

## How It's Different

| Feature | Playwright | gsd-browser | **AgenticBrowser** |
|---|---|---|---|
| Anti-bot handling | None | None | **Built-in (stealth + auto-solve)** |
| Challenge solving | None | None | **Cloudflare + CAPTCHA autonomous** |
| Content reading | Raw DOM | Snapshots | **Smart multi-source extraction** |
| Intent-based actions | Selectors only | Refs + intents | **Natural language intents** |
| Access state machine | No | No | **Yes (READABLE, CHALLENGE, etc.)** |
| MCP integration | No | No | **Yes (9 MCP tools)** |

## Quick Start

### As MCP Server (for Claude, Cursor, etc.)

```bash
# Install
cd AgenticBrowser
npm install
npx playwright install chromium

# Run as MCP server
npm run mcp
```

Add to your MCP config:

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

### As CLI

```bash
# Open a URL (auto-handles Cloudflare/CAPTCHA)
npx tsx src/cli.ts open https://example.com

# Read page content as markdown
npx tsx src/cli.ts read

# Click by intent
npx tsx src/cli.ts act click "the login button"

# Extract structured data
npx tsx src/cli.ts extract '{"products": [{"name": "", "price": ""}]}'
```

### As SDK

```typescript
import { openUrl, readContent, actOnPage } from 'agentic-browser';

// Open and auto-handle challenges
const page = await openUrl('https://example.com');

// Read clean markdown content
const content = await readContent({ format: 'markdown' });

// Click by natural language intent
await actOnPage({ action: 'click', intent: 'the pricing tab' });
```

## MCP Tools

| Tool | Description |
|---|---|
| `browser_open` | Open URL, auto-handle challenges, return state |
| `browser_observe` | Page summary + interactive elements |
| `browser_read` | Clean content extraction (markdown/text/html) |
| `browser_act` | Intent-based interaction (click, type, scroll, etc.) |
| `browser_extract` | Schema-driven structured data extraction |
| `browser_verify` | Goal/condition verification |
| `browser_recover` | Try alternative access methods |
| `browser_debug` | Console, network, screenshot diagnostics |
| `browser_navigate` | Back, forward, reload, goto |

## Stealth Strategy

The browser passes anti-bot systems through 6 layers:

1. **Real Chrome binary** — Authentic TLS fingerprint, HTTP/2, rendering
2. **Automation marker removal** — navigator.webdriver, chrome.runtime, cdc_ props
3. **Realistic fingerprint** — Consistent canvas, WebGL, hardware properties
4. **Human-like behavior** — Bézier mouse curves, variable keystroke timing
5. **Autonomous challenge solving** — Cloudflare auto-wait, CAPTCHA checkbox click, audio STT
6. **Session persistence** — Cookies and profile data persist across sessions

## Architecture

```
Agent Layer (MCP / CLI / SDK)
    ↓
Command Router (9 commands)
    ↓
Autonomous Solver (Cloudflare + CAPTCHA)
    ↓
Access State Machine (classifies every page)
    ↓
Smart Reading Engine (multi-source extraction)
    ↓
Stealth Browser Runtime (Playwright + real Chrome)
```

## Requirements

- Node.js 20+
- Chrome or Chromium installed
- TypeScript 5+

## License

MIT
