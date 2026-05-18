# tls-shim — Chrome-coherent TLS / HTTP-2 proxy

`agentic-tls-shim` is a localhost HTTP proxy that closes the
network-layer fingerprinting gap. The browser connects to it; it
re-establishes the outbound TLS connection with a ClientHello whose
JA3 / JA4 / Akamai signatures match Chrome stable for the configured
version. HTTP/2 SETTINGS frame ordering and pseudo-header order match
Chrome as well.

This closes a class of detections the JS-level stealth layer
fundamentally cannot reach. Until the source-level Chromium fork lands,
this is how we look like Chrome on the wire.

## Build

```bash
cd tls-shim
cargo build --release
```

Binary lands at `target/release/agentic-tls-shim`.

## Run

```bash
./target/release/agentic-tls-shim --listen 127.0.0.1:8443 --chrome-version 138
```

Then in the JS runtime:

```typescript
updateConfig({
  proxy: 'http://127.0.0.1:8443',
});
```

Or start it automatically alongside the browser by setting
`AGENTIC_TLS_SHIM=1` (wiring lands in the next runtime patch).

## Status

Milestone 1 (this commit): listener, CONNECT handling, byte-splicing
between client and origin, profile module with Chrome cipher/SETTINGS
constants. Cargo builds and binary runs.

Milestone 2: MITM the browser-side TLS using a per-launch local trust
anchor installed into the browser profile, terminate it, then
re-handshake outbound with a hand-built `ClientHelloPayload` carrying
the constants from `chrome_profile.rs`. Patches rustls's TLS frame
builder to permit Chrome's exact wire bytes (extension order,
GREASE positions, ALPN order).

Milestone 3: HTTP/2 frame rewriter so SETTINGS frame ordering, WINDOW
updates, and HEADERS pseudo-header order match Chrome. Same for HTTP/3
QUIC transport parameters once Chrome stable's profile is captured.

## Why not just use ja3 patcher libraries?

Existing JA3-spoofing libraries get the cipher bytes right but miss
extension ordering, GREASE values, and HTTP/2 frame ordering — and the
Akamai fingerprint catches all three. This shim is built from the wire
specification, not from a fingerprint hash.
