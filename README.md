# AgenticBrowser

> Autonomous browser runtime for AI agents.
> If a human can access it, the agent accesses it.

AgenticBrowser is a browser that gives AI agents a real, full-fidelity web.
Anti-bot challenges are resolved without a human in the loop. Pages are
read as clean content. Interactions happen by natural-language intent.
Every behavioral signal — mouse path, typing cadence, scroll pattern — is
modelled on real human telemetry.

The runtime is layered. You can swap the substrate underneath (the real
Chrome on your machine today, our patched-Chromium binary tomorrow)
without touching agent code.

## What it does

- **Opens any URL** including JS SPAs, iframes, shadow DOM, lazy content
- **Auto-resolves challenges** including Cloudflare, reCAPTCHA, hCaptcha
- **Reads clean content** via multi-source extraction to markdown
- **Acts by intent** like `click the login button`, `type into the search box`
- **Extracts structured data** from any page given a JSON schema
- **Verifies goals** like `user is logged in`, `page contains pricing`
- **Recovers from blocks** by trying reader mode, archive snapshots, print versions
- **Persists profiles** to stay logged in across sessions

## Architecture

```
Agent layer (MCP / CLI / SDK)
        │
Command router (open / read / act / extract / verify / recover / debug / navigate)
        │
Autonomous challenge solver  ◀──  Access state machine
        │
Smart reading + structured extraction
        │
Behavior layer (Bezier pointer · timed typing · realistic scroll)
        │
Stealth engine (CDP + init scripts + Client Hints + worker coverage)
        │
Runtime backend (chrome | patched binary — auto-selected)
```

Folders mirror this:

| Path | What lives there |
|---|---|
| `src/commands/` | One file per agent verb |
| `src/state-machine/` | Page classification (`READABLE`, `CHALLENGE_REQUIRED`, etc.) |
| `src/solver/` | Cloudflare + CAPTCHA autonomous solvers |
| `src/reading/` | Multi-source content extraction |
| `src/interaction/` | Intent-resolution + accessibility tree |
| `src/behavior/` | Pointer / typing / scrolling models |
| `src/stealth/` | Init script generator + CDP coherence layer |
| `src/fingerprint/` | Per-launch seed + coherent fingerprint profile |
| `src/network/` | Proxy parsing, IP-to-geo, Chromium arg builder |
| `src/runtime/` | Backend selection (chrome / patched binary) |
| `src/core/` | Browser pool + config + sessions |
| `runtime-binary/` | Patched-Chromium backend (build infrastructure) |

## Stealth strategy

Three layers, each closing a different category of detection:

**Fingerprint coherence.** Every randomized surface (GPU vendor, screen
dimensions, hardware concurrency, device memory, timezone, locale,
Client Hints brands) is derived from a single per-launch seed, so values
stay self-consistent across the entire session. A site that samples
twice never catches drift.

**CDP-level overrides.** Locale, timezone, user agent, Client Hints
brands, and device metrics are set through CDP — not through
JavaScript injection that detection libraries can flag. The same
overrides propagate to workers, service workers, and same-origin
iframes via auto-attach.

**Behavioral realism.** Pointer movement follows cubic Bezier paths with
random control points, ease-in-out, micro-wobble proportional to
distance, burst-pause cadence, and occasional overshoot. Typing draws
per-character delays from a class-aware distribution (digits faster than
punctuation), with word-boundary bursts and a small typo+correction
rate. Scrolling chunks with variable inter-chunk delays and occasional
reverse micro-corrections.

**Going further: source-level patches.** JS injection is structurally
detectable — patched property descriptors and `Function.prototype.toString`
shape leak no matter how carefully you mask them. The `runtime-binary/`
backend is a Chromium build with fingerprint surfaces modified at the
C++ / V8 binding level (canvas pipeline, WebGL parameters, audio buffers,
TLS ClientHello, V8 webdriver binding). When the binary is present, the
JS runtime detects it and routes through it automatically. See
[runtime-binary/README.md](runtime-binary/README.md) for the patch
manifest and build status.

## Quick start

```bash
npm install
npx playwright install chromium
```

### As MCP server

```bash
npm run mcp
```

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
npx tsx src/cli.ts open https://example.com
npx tsx src/cli.ts read
npx tsx src/cli.ts act click "the login button"
npx tsx src/cli.ts extract '{"products":[{"name":"","price":""}]}'
```

### As SDK

```typescript
import { openUrl, readContent, actOnPage, updateConfig } from 'agentic-browser';

// Optional: configure proxy, behavior preset, persistent profile, geo
updateConfig({
  proxy: 'http://user:pass@proxy.example:8080',
  geoFromProxy: true,
  behaviorPreset: 'relaxed',
  persistentProfile: true,
});

const result = await openUrl('https://example.com');
const content = await readContent({ format: 'markdown' });
await actOnPage({ action: 'click', intent: 'the pricing tab' });
```

## Configuration

```typescript
updateConfig({
  headless: false,                          // default; headed avoids HeadlessChrome leak
  backend: 'patched' | 'chrome',            // optional; auto when omitted
  proxy: 'socks5://user:pass@host:1080',    // http(s) and socks5 both supported
  geoFromProxy: true,                       // tz/locale auto-resolve from proxy IP
  fingerprintPlatform: 'mac' | 'win' | 'linux',
  persistentProfile: true,                  // avoids incognito-detection penalty
  profileName: 'work',                      // separate cookie/localStorage stores
  behaviorPreset: 'relaxed' | 'careful',
});
```

Environment overrides:

| Var | Effect |
|---|---|
| `AGENTIC_BROWSER_BACKEND` | Force `chrome` or `patched` |
| `AGENTIC_BROWSER_BINARY` | Override path to patched binary |

## MCP tools

| Tool | Purpose |
|---|---|
| `browser_open` | Open URL, auto-resolve challenges, return state |
| `browser_observe` | Page summary + interactive element list |
| `browser_read` | Clean content extraction (markdown / text / html) |
| `browser_act` | Intent-based interaction (click, type, scroll, hover, select, press) |
| `browser_extract` | Schema-driven structured extraction |
| `browser_verify` | Goal / condition verification |
| `browser_recover` | Try alternative access methods |
| `browser_debug` | Console, network, screenshot diagnostics |
| `browser_navigate` | Back, forward, reload, goto |

## Requirements

- Node.js 20+
- Chrome or Chromium installed (or the patched binary; see `runtime-binary/`)
- TypeScript 5+

## License

MIT
