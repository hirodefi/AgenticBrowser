# Binary runtime — source-level fingerprint patches

This directory is the home of the patched-Chromium backend. When built, it
produces a Chromium binary with fingerprint surfaces modified at the C++ /
V8 binding level. The JavaScript runtime layer in `../src/` detects the
binary automatically and uses it as the substrate; no API changes.

The goal is the same fingerprint surface coverage as the strongest
anti-detection browsers in the wild, achieved through our own
implementations of every patch. We are not porting anyone else's patches —
each one is written from a description of the detection vector it closes.

Status: build infrastructure in progress. The patch manifest below is the
roadmap. Each entry is a self-contained surface; patches are independent
and can land one at a time.

## Patch manifest

### V8 / blink bindings (priority 1, hardest to fake from JS)

- **automation-binding-removal** — strip `navigator.webdriver` at the V8
  WebIDL binding generation step so the property simply does not exist on
  `Navigator.prototype`. Closes the descriptor-shape detection used by
  FingerprintJS and BrowserScan.
- **cdp-runtime-isolation** — suppress the side effects of
  `Runtime.enable` and related CDP domains that detection libs probe for
  via timing-based isAutomatedWithCDP checks.
- **process-info-cleanup** — remove leftover argv strings that include
  flags like `--remote-debugging-port`.

### Graphics pipeline (priority 1, observable from any page)

- **canvas-pipeline-noise** — inject deterministic per-pixel noise inside
  the 2D canvas readback pipeline (`SkSurface::readPixels`) keyed off a
  per-session seed. Closes canvas fingerprinting.
- **webgl-parameter-noise** — randomize precision-format ranges and
  performance counters at the GPU command translator. Closes WebGL
  fingerprinting that goes beyond vendor/renderer strings.
- **webgl-program-noise** — perturb shader compile statistics returned by
  `getProgramInfoLog`.
- **font-list-randomization** — shuffle and prune the system font list
  reported to `document.fonts` and to text-measurement APIs that infer
  fonts from glyph metrics.

### Audio (priority 2)

- **audio-buffer-noise** — apply a per-session scaling factor to
  `AudioBuffer` output and to `AnalyserNode` frequency data inside the
  audio thread, not in JS.

### Network / TLS (priority 1 for IP-level detection)

- **tls-clienthello-coherence** — make the BoringSSL ClientHello cipher
  list, extensions, ALPN, and GREASE values match the Chrome stable
  release for the spoofed version. Closes ja3n / ja4 / akamai
  fingerprinting.
- **http2-settings-coherence** — align HTTP/2 SETTINGS frame ordering and
  HEADERS frame pseudo-header order with Chrome stable.
- **http3-quic-coherence** — same alignment for HTTP/3 transport
  parameters.
- **webrtc-ice-coherence** — control which ICE candidates are emitted and
  ensure the gathering order matches Chrome stable.
- **resolver-leak-removal** — strip the DNS-over-HTTPS metadata that
  proxies sometimes leak.

### System / OS (priority 3, smaller signal)

- **screen-coherence** — report `Screen.availWidth`/`availHeight` from a
  configurable virtual screen, not from the OS, so headless and headed
  agree.
- **window-position-coherence** — same for `window.screenX`/`screenY`.
- **hardware-info-coherence** — report `navigator.hardwareConcurrency`
  and `navigator.deviceMemory` from a per-session config, not from the
  host.
- **timezone-binary-flag** — accept `--fp-timezone=` and apply it before
  the renderer initializes ICU, so the timezone is set without going
  through detectable `Emulation.setTimezoneOverride`.
- **locale-binary-flag** — same for locale.

## Build plan

1. Vendor a Chromium source tree as a sibling git repo
   (`agentic-browser-chromium`), not inside this repo. Each patch lives
   in `agentic-browser-chromium/patches/`.
2. Build script (`build.sh`) bootstraps depot_tools, fetches
   Chromium, applies patches, and produces release archives for
   `darwin-arm64`, `linux-x64`, `windows-x64`.
3. Releases publish to GitHub Releases on this repo. The JS runtime
   downloads to `~/.agentic-browser/binary/` on first launch.
4. Per-Chrome-release rebases are CI-automated against the canary
   channel.

## Selection

The JS runtime selects this backend automatically when the binary is
present. Force selection with:

```bash
AGENTIC_BROWSER_BACKEND=patched node …
AGENTIC_BROWSER_BACKEND=chrome  node …   # force the JS-stealth path
```

Override binary location with `AGENTIC_BROWSER_BINARY=/path/to/chrome`.
